//! Phase-0 T2/T3 probe policy.
//!
//! `enforce` requires auth from the smart account and emits a small event.
//! It never rejects anything. `install`/`uninstall` only require auth.
//! Built against OpenZeppelin/stellar-contracts @ 1e513890 so the `Policy`
//! trait ABI matches the canonical smart-account wasm (1b5f4534...).
#![no_std]

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contractevent, contractimpl, symbol_short, Address, Env, Symbol, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

#[contractevent]
#[derive(Clone)]
pub struct NoopEnforced {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub contract: Option<Address>,
    pub fn_name: Symbol,
    pub signers: u32,
}

#[contract]
pub struct NoopPolicy;

#[contractimpl]
impl Policy for NoopPolicy {
    type AccountParams = ();

    fn enforce(
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();
        let (contract, fn_name) = match &context {
            Context::Contract(ContractContext { contract, fn_name, .. }) => {
                (Some(contract.clone()), fn_name.clone())
            }
            _ => (None, symbol_short!("create")),
        };
        NoopEnforced {
            smart_account,
            context_rule_id: context_rule.id,
            contract,
            fn_name,
            signers: authenticated_signers.len(),
        }
        .publish(e);
    }

    fn install(_e: &Env, _install_params: (), _context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
    }

    fn uninstall(_e: &Env, _context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
    }
}
