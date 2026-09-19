//! Phase-0 T6 probe: does a nested `caller.require_auth()` inside the XOXNO controller get satisfied through the
//! router's auth tree when the smart account is authorised by the agent key?
//! `tick_force(user, account_id, amount)` = controller.withdraw(hub1 -> user) then controller.supply(user -> hub2).
#![no_std]

use soroban_sdk::{contract, contractclient, contractevent, contractimpl, contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HubAssetKey {
    pub asset: Address,
    pub hub_id: u32,
}

#[contractclient(name = "ControllerClient")]
pub trait Controller {
    fn withdraw(env: Env, caller: Address, account_id: u64, withdrawals: Vec<(HubAssetKey, i128)>, to: Option<Address>) -> Vec<(HubAssetKey, i128)>;
    fn supply(env: Env, caller: Address, account_id: u64, spoke_id: u32, assets: Vec<(HubAssetKey, i128)>) -> u64;
}

#[contracttype]
pub enum DataKey {
    Controller,
    Usdc,
}

#[contractevent]
#[derive(Clone)]
pub struct Fired {
    #[topic]
    pub user: Address,
    pub account_id: u64,
    pub from_hub: u32,
    pub to_hub: u32,
    pub amount: i128,
}

#[contract]
pub struct NietRouter;

#[contractimpl]
impl NietRouter {
    pub fn __constructor(e: Env, controller: Address, usdc: Address) {
        e.storage().instance().set(&DataKey::Controller, &controller);
        e.storage().instance().set(&DataKey::Usdc, &usdc);
    }

    pub fn tick_force(e: Env, user: Address, account_id: u64, from_hub: u32, to_hub: u32, spoke_id: u32, amount: i128) -> i128 {
        user.require_auth();
        let controller: Address = e.storage().instance().get(&DataKey::Controller).unwrap();
        let usdc: Address = e.storage().instance().get(&DataKey::Usdc).unwrap();
        let client = ControllerClient::new(&e, &controller);
        let from = HubAssetKey { asset: usdc.clone(), hub_id: from_hub };
        let to = HubAssetKey { asset: usdc, hub_id: to_hub };
        let mut withdrawals = Vec::new(&e);
        withdrawals.push_back((from, amount));
        let got = client.withdraw(&user, &account_id, &withdrawals, &Some(user.clone()));
        let received = got.get(0).map(|(_, a)| a).unwrap_or(0);
        assert!(received > 0, "withdraw returned nothing");
        let mut assets = Vec::new(&e);
        assets.push_back((to, received));
        client.supply(&user, &account_id, &spoke_id, &assets);
        Fired { user, account_id, from_hub, to_hub, amount: received }.publish(&e);
        received
    }
}
