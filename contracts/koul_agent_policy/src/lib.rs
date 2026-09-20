//! koul_agent_policy: what an agent session key may do with a user's smart account.
//!
//! Implements `stellar_accounts::policies::Policy` at OpenZeppelin/stellar-contracts @ 1e513890.
//! Attached to a `Default` context rule whose only signer is the agent's Ed25519 key, it is invoked once per
//! auth context (root invocation and every sub-invocation) and:
//!   1. rejects anything that is not a `Context::Contract`;
//!   2. requires `(contract, fn_name)` to be in `allowed_calls`;
//!   3. for `transfer`, requires `args[1]` (recipient) to be in `allowed_transfer_recipients`;
//!   4. for the XOXNO controller's `withdraw` / `supply` / `repay`, requires `args[1]` (account id) to equal the
//!      pinned `account_id`, and for `withdraw` requires `args[3]` (`to`) to be `None` or the smart account itself,
//!      so the agent can only ever move funds between the user's wallet and the user's own position;
//!   5. counts enforce calls per (account, rule) in a rolling ledger window and rejects above the limit;
//!   6. emits a small event (never the whole Context, see OZ issue #852).
#![no_std]

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, symbol_short, Address, Env,
    Symbol, TryFromVal, Val, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

#[contracttype]
#[derive(Clone, Debug)]
pub struct KoulAgentParams {
    /// The user's XOXNO account id. Controller calls naming another account are rejected.
    pub account_id: u64,
    pub allowed_calls: Vec<(Address, Symbol)>,
    pub allowed_transfer_recipients: Vec<Address>,
    pub max_calls_per_window: u32,
    pub window_ledgers: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct WindowState {
    pub window_start: u32,
    pub calls: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Params(Address, u32),
    Window(Address, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum KoulPolicyError {
    NotInstalled = 7100,
    NoSigners = 7101,
    NotContractContext = 7102,
    CallNotAllowed = 7103,
    TransferRecipientNotAllowed = 7104,
    Arity = 7105,
    RateLimited = 7106,
    BadParams = 7107,
    AccountNotAllowed = 7108,
    WithdrawRecipientNotAllowed = 7109,
}

#[contractevent]
#[derive(Clone)]
pub struct KoulEnforced {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub contract: Address,
    pub fn_name: Symbol,
    pub calls_in_window: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct KoulInstalled {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub allowed_calls: u32,
    pub max_calls_per_window: u32,
    pub window_ledgers: u32,
}

const TTL_THRESHOLD: u32 = 17280 * 7;
const TTL_EXTEND: u32 = 17280 * 30;

fn params(e: &Env, smart_account: &Address, rule_id: u32) -> KoulAgentParams {
    let key = StorageKey::Params(smart_account.clone(), rule_id);
    let p: KoulAgentParams = e.storage().persistent().get(&key).unwrap_or_else(|| panic_with_error!(e, KoulPolicyError::NotInstalled));
    e.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    p
}

/// XOXNO controller calls carry the account id as their second argument.
fn check_account(e: &Env, args: &Vec<Val>, account_id: u64) {
    let id = u64::try_from_val(e, &args.get(1).unwrap()).unwrap_or_else(|_| panic_with_error!(e, KoulPolicyError::Arity));
    if id != account_id {
        panic_with_error!(e, KoulPolicyError::AccountNotAllowed);
    }
}

#[contract]
pub struct KoulAgentPolicy;

#[contractimpl]
impl Policy for KoulAgentPolicy {
    type AccountParams = KoulAgentParams;

    fn enforce(e: &Env, context: Context, authenticated_signers: Vec<Signer>, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        if authenticated_signers.is_empty() {
            panic_with_error!(e, KoulPolicyError::NoSigners);
        }
        let p = params(e, &smart_account, context_rule.id);
        let (contract, fn_name, args) = match context {
            Context::Contract(ContractContext { contract, fn_name, args }) => (contract, fn_name, args),
            _ => panic_with_error!(e, KoulPolicyError::NotContractContext),
        };
        let allowed = p.allowed_calls.iter().any(|(c, f)| c == contract && f == fn_name);
        if !allowed {
            panic_with_error!(e, KoulPolicyError::CallNotAllowed);
        }
        if fn_name == symbol_short!("transfer") {
            if args.len() != 3 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            let to = Address::try_from_val(e, &args.get(1).unwrap()).unwrap_or_else(|_| panic_with_error!(e, KoulPolicyError::Arity));
            if !p.allowed_transfer_recipients.iter().any(|r| r == to) {
                panic_with_error!(e, KoulPolicyError::TransferRecipientNotAllowed);
            }
        } else if fn_name == symbol_short!("withdraw") {
            if args.len() != 4 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            check_account(e, &args, p.account_id);
            let to: Val = args.get(3).unwrap();
            if !to.is_void() {
                let to = Address::try_from_val(e, &to).unwrap_or_else(|_| panic_with_error!(e, KoulPolicyError::Arity));
                if to != smart_account {
                    panic_with_error!(e, KoulPolicyError::WithdrawRecipientNotAllowed);
                }
            }
        } else if fn_name == symbol_short!("supply") {
            if args.len() != 4 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            check_account(e, &args, p.account_id);
        } else if fn_name == symbol_short!("repay") {
            if args.len() != 3 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            check_account(e, &args, p.account_id);
        }
        let now = e.ledger().sequence();
        let wkey = StorageKey::Window(smart_account.clone(), context_rule.id);
        let mut w: WindowState = e.storage().persistent().get(&wkey).unwrap_or(WindowState { window_start: now, calls: 0 });
        if now.saturating_sub(w.window_start) >= p.window_ledgers {
            w = WindowState { window_start: now, calls: 0 };
        }
        w.calls += 1;
        if w.calls > p.max_calls_per_window {
            panic_with_error!(e, KoulPolicyError::RateLimited);
        }
        e.storage().persistent().set(&wkey, &w);
        e.storage().persistent().extend_ttl(&wkey, TTL_THRESHOLD, TTL_EXTEND);
        KoulEnforced { smart_account, context_rule_id: context_rule.id, contract, fn_name, calls_in_window: w.calls }.publish(e);
    }

    fn install(e: &Env, install_params: KoulAgentParams, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        if install_params.account_id == 0 || install_params.allowed_calls.is_empty() || install_params.max_calls_per_window == 0 || install_params.window_ledgers == 0 {
            panic_with_error!(e, KoulPolicyError::BadParams);
        }
        let key = StorageKey::Params(smart_account.clone(), context_rule.id);
        e.storage().persistent().set(&key, &install_params);
        e.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        KoulInstalled {
            smart_account,
            context_rule_id: context_rule.id,
            allowed_calls: install_params.allowed_calls.len(),
            max_calls_per_window: install_params.max_calls_per_window,
            window_ledgers: install_params.window_ledgers,
        }
        .publish(e);
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        e.storage().persistent().remove(&StorageKey::Params(smart_account.clone(), context_rule.id));
        e.storage().persistent().remove(&StorageKey::Window(smart_account, context_rule.id));
    }
}

#[contractimpl]
impl KoulAgentPolicy {
    pub fn get_params(e: Env, smart_account: Address, context_rule_id: u32) -> Option<KoulAgentParams> {
        e.storage().persistent().get(&StorageKey::Params(smart_account, context_rule_id))
    }

    pub fn get_window(e: Env, smart_account: Address, context_rule_id: u32) -> Option<WindowState> {
        e.storage().persistent().get(&StorageKey::Window(smart_account, context_rule_id))
    }
}
