//! Phase-0 T3/T7 negative probe: a policy that rejects every context.
#![no_std]

use soroban_sdk::{auth::Context, contract, contracterror, contractimpl, panic_with_error, Address, Env, Vec};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DenyError {
    Denied = 7001,
}

#[contract]
pub struct DenyPolicy;

#[contractimpl]
impl Policy for DenyPolicy {
    type AccountParams = ();

    fn enforce(e: &Env, _context: Context, _authenticated_signers: Vec<Signer>, _context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        panic_with_error!(e, DenyError::Denied);
    }

    fn install(_e: &Env, _install_params: (), _context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
    }

    fn uninstall(_e: &Env, _context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
    }
}
