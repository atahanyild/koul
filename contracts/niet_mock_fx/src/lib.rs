//! Testnet stand-in for the Reflector FX oracle, same read interface (`base`, `decimals`, `resolution`,
//! `lastprice(asset) -> Option<PriceData>`), plus `set_price(asset, price)` so the demo can move USD/TRY live.
//! Reflector testnet has no TRY feed; on mainnet the router points at Reflector and this contract is not deployed.
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Price(Asset),
}

#[contract]
pub struct NietMockFx;

#[contractimpl]
impl NietMockFx {
    pub fn __constructor(e: Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Price in `decimals()` units of USD per 1 unit of `asset`, stamped with the current ledger time.
    pub fn set_price(e: Env, asset: Asset, price: i128) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let data = PriceData { price, timestamp: e.ledger().timestamp() };
        e.storage().instance().set(&DataKey::Price(asset), &data);
    }

    /// Same as `set_price` but with an explicit timestamp, to rehearse the router's staleness guard.
    pub fn set_price_at(e: Env, asset: Asset, price: i128, timestamp: u64) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        e.storage().instance().set(&DataKey::Price(asset), &PriceData { price, timestamp });
    }

    pub fn base(_e: Env) -> Asset {
        Asset::Other(Symbol::new(&_e, "USD"))
    }

    pub fn decimals(_e: Env) -> u32 {
        14
    }

    pub fn resolution(_e: Env) -> u32 {
        300
    }

    pub fn lastprice(e: Env, asset: Asset) -> Option<PriceData> {
        e.storage().instance().get(&DataKey::Price(asset))
    }
}
