//! niet_router: the on-chain decision tree for one user's XOXNO position.
//!
//! `set_rules(user, rules)` is passkey-signed. `tick(user)` is what the keeper pokes; it needs `user.require_auth()`,
//! which the agent key satisfies through the smart account's `niet-agent` rule and `niet_agent_policy`. The router
//! reads pool rates, the controller's health factor and collateral, and an FX oracle (Reflector interface), then
//! executes at most one branch in priority order: health guard > rebalance > FX exit > none. It holds no funds and
//! keeps no state beyond the rules.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token, Address,
    BytesN, Env, Symbol, Vec,
};

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
    fn repay(env: Env, caller: Address, account_id: u64, payments: Vec<(HubAssetKey, i128)>);
    fn get_health_factor(env: Env, account_id: u64) -> i128;
    fn get_collateral_amount(env: Env, account_id: u64, hub_asset: HubAssetKey) -> i128;
    fn get_borrow_amount(env: Env, account_id: u64, hub_asset: HubAssetKey) -> i128;
}

#[contractclient(name = "PoolClient")]
pub trait Pool {
    fn get_deposit_rate(env: Env, hub_asset: HubAssetKey) -> i128;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleAsset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contractclient(name = "OracleClient")]
pub trait Oracle {
    fn lastprice(env: Env, asset: OracleAsset) -> Option<PriceData>;
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    pub controller: Address,
    pub pool: Address,
    pub usdc: Address,
    pub oracle: Address,
    pub spoke_id: u32,
}

/// One user's rule set. Every branch is optional: a zero threshold, a zero minimum health factor or
/// `fx_enabled = false` disables it.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Rules {
    pub account_id: u64,
    pub hub_a: u32,
    pub hub_b: u32,
    /// Rebalance when |rate_b - rate_a| exceeds this many basis points (annual deposit rate). 0 disables.
    pub rebalance_threshold_bps: u32,
    /// Repay from idle wallet USDC when the health factor (WAD) drops below this. 0 disables.
    pub min_health_factor_wad: i128,
    pub fx_enabled: bool,
    /// Oracle asset symbol, e.g. "TRY"; the oracle quotes USD per 1 unit of it with 14 decimals.
    pub fx_asset: Symbol,
    /// Trigger when price >= level (`fx_above = true`) or price <= level (`fx_above = false`).
    pub fx_level: i128,
    pub fx_above: bool,
    /// Reject oracle prices older than this many seconds.
    pub max_price_age_secs: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    None,
    Repay(u32, i128),
    Rebalance(u32, u32, i128),
    FxExit(i128),
}

#[contracttype]
pub enum DataKey {
    Config,
    Admin,
    Rules(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RouterError {
    NoRules = 7200,
    BadRules = 7201,
    NoIdleFunds = 7202,
    NoPrice = 7203,
    StalePrice = 7204,
    PostConditionFailed = 7205,
    NothingMoved = 7206,
}

#[contractevent]
#[derive(Clone)]
pub struct Fired {
    #[topic]
    pub user: Address,
    pub account_id: u64,
    pub branch: Symbol,
    pub amount: i128,
    pub from_hub: u32,
    pub to_hub: u32,
    pub observed: i128,
    pub observed_2: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct RulesSet {
    #[topic]
    pub user: Address,
    pub account_id: u64,
    pub rebalance_threshold_bps: u32,
    pub min_health_factor_wad: i128,
    pub fx_enabled: bool,
}

const RAY: i128 = 1_000_000_000_000_000_000_000_000_000;
/// Amounts passed to the controller must be identical at simulation and execution, while positions accrue interest
/// every ledger. Every amount is therefore snapped to 0.01 USDC, and moves below 1 USDC are ignored.
const GRAIN: i128 = 100_000;
const MIN_MOVE: i128 = 10_000_000;
const TTL_THRESHOLD: u32 = 17280 * 7;
const TTL_EXTEND: u32 = 17280 * 30;

/// Which way to move collateral, if any. Rates are annual RAY deposit rates.
pub fn rebalance_direction(rate_a: i128, rate_b: i128, threshold_bps: u32, coll_a: i128, coll_b: i128) -> Option<bool> {
    if threshold_bps == 0 {
        return None;
    }
    let min_delta = (threshold_bps as i128) * (RAY / 10_000);
    if rate_b - rate_a > min_delta && floor_grain(coll_a) >= MIN_MOVE {
        Some(true)
    } else if rate_a - rate_b > min_delta && floor_grain(coll_b) >= MIN_MOVE {
        Some(false)
    } else {
        None
    }
}

pub fn floor_grain(x: i128) -> i128 {
    if x <= 0 { 0 } else { x - x % GRAIN }
}

pub fn ceil_grain(x: i128) -> i128 {
    if x <= 0 { 0 } else if x % GRAIN == 0 { x } else { x - x % GRAIN + GRAIN }
}

pub fn fx_triggered(price: i128, level: i128, above: bool) -> bool {
    if above { price >= level } else { price <= level }
}

pub fn is_stale(now: u64, ts: u64, max_age: u64) -> bool {
    now.saturating_sub(ts) > max_age
}

fn config(e: &Env) -> Config {
    e.storage().instance().get(&DataKey::Config).unwrap()
}

fn key(cfg: &Config, hub: u32) -> HubAssetKey {
    HubAssetKey { asset: cfg.usdc.clone(), hub_id: hub }
}

#[contract]
pub struct NietRouter;

#[contractimpl]
impl NietRouter {
    pub fn __constructor(e: Env, admin: Address, controller: Address, pool: Address, usdc: Address, oracle: Address, spoke_id: u32) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Config, &Config { controller, pool, usdc, oracle, spoke_id });
    }

    /// Admin-only wasm upgrade so the router address (and every user's policy allowlist) stays stable.
    pub fn upgrade(e: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        e.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn set_oracle(e: Env, oracle: Address) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let mut cfg = config(&e);
        cfg.oracle = oracle;
        e.storage().instance().set(&DataKey::Config, &cfg);
    }

    pub fn get_config(e: Env) -> Config {
        config(&e)
    }

    pub fn set_rules(e: Env, user: Address, rules: Rules) {
        user.require_auth();
        if rules.hub_a == rules.hub_b || (rules.fx_enabled && rules.max_price_age_secs == 0) || rules.min_health_factor_wad < 0 {
            panic_with_error!(&e, RouterError::BadRules);
        }
        let k = DataKey::Rules(user.clone());
        e.storage().persistent().set(&k, &rules);
        e.storage().persistent().extend_ttl(&k, TTL_THRESHOLD, TTL_EXTEND);
        RulesSet { user, account_id: rules.account_id, rebalance_threshold_bps: rules.rebalance_threshold_bps, min_health_factor_wad: rules.min_health_factor_wad, fx_enabled: rules.fx_enabled }.publish(&e);
    }

    pub fn clear_rules(e: Env, user: Address) {
        user.require_auth();
        e.storage().persistent().remove(&DataKey::Rules(user));
    }

    pub fn get_rules(e: Env, user: Address) -> Option<Rules> {
        e.storage().persistent().get(&DataKey::Rules(user))
    }

    /// Evaluate and execute the winning branch for `user`. Returns `Action::None` when nothing applies, so the
    /// keeper can simulate first and skip submission.
    pub fn tick(e: Env, user: Address) -> Action {
        user.require_auth();
        let cfg = config(&e);
        let rk = DataKey::Rules(user.clone());
        let mut rules: Rules = e.storage().persistent().get(&rk).unwrap_or_else(|| panic_with_error!(&e, RouterError::NoRules));
        e.storage().persistent().extend_ttl(&rk, TTL_THRESHOLD, TTL_EXTEND);
        let controller = ControllerClient::new(&e, &cfg.controller);
        let pool = PoolClient::new(&e, &cfg.pool);
        let id = rules.account_id;
        let (ka, kb) = (key(&cfg, rules.hub_a), key(&cfg, rules.hub_b));

        // 1. Health guard: repay from idle wallet USDC.
        if rules.min_health_factor_wad > 0 {
            let hf = controller.get_health_factor(&id);
            if hf < rules.min_health_factor_wad {
                let idle = token::TokenClient::new(&e, &cfg.usdc).balance(&user);
                let (debt_a, debt_b) = (controller.get_borrow_amount(&id, &ka), controller.get_borrow_amount(&id, &kb));
                let (hub, debt) = if debt_a >= debt_b { (rules.hub_a, debt_a) } else { (rules.hub_b, debt_b) };
                let want = ceil_grain(debt);
                let pay = if idle >= want { want } else { floor_grain(idle) };
                if pay <= 0 {
                    panic_with_error!(&e, RouterError::NoIdleFunds);
                }
                let mut payments = Vec::new(&e);
                payments.push_back((key(&cfg, hub), pay));
                controller.repay(&user, &id, &payments);
                let hf_after = controller.get_health_factor(&id);
                if hf_after < rules.min_health_factor_wad && pay < want {
                    panic_with_error!(&e, RouterError::PostConditionFailed);
                }
                Fired { user, account_id: id, branch: Symbol::new(&e, "health"), amount: pay, from_hub: hub, to_hub: hub, observed: hf, observed_2: hf_after }.publish(&e);
                return Action::Repay(hub, pay);
            }
        }

        // 2. Rebalance between the two USDC hubs on the deposit-rate gap.
        if rules.rebalance_threshold_bps > 0 {
            let (ra, rb) = (pool.get_deposit_rate(&ka), pool.get_deposit_rate(&kb));
            let (ca, cb) = (controller.get_collateral_amount(&id, &ka), controller.get_collateral_amount(&id, &kb));
            if let Some(a_to_b) = rebalance_direction(ra, rb, rules.rebalance_threshold_bps, ca, cb) {
                let (from, to, amount) = if a_to_b { (rules.hub_a, rules.hub_b, floor_grain(ca)) } else { (rules.hub_b, rules.hub_a, floor_grain(cb)) };
                let received = Self::move_collateral(&e, &cfg, &controller, &user, id, from, to, amount);
                Fired { user, account_id: id, branch: Symbol::new(&e, "rebalance"), amount: received, from_hub: from, to_hub: to, observed: ra, observed_2: rb }.publish(&e);
                return Action::Rebalance(from, to, received);
            }
        }

        // 3. FX exit: pull everything back to the wallet once, then disarm.
        if rules.fx_enabled {
            let oracle = OracleClient::new(&e, &cfg.oracle);
            let p = oracle.lastprice(&OracleAsset::Other(rules.fx_asset.clone())).unwrap_or_else(|| panic_with_error!(&e, RouterError::NoPrice));
            if is_stale(e.ledger().timestamp(), p.timestamp, rules.max_price_age_secs) {
                panic_with_error!(&e, RouterError::StalePrice);
            }
            if fx_triggered(p.price, rules.fx_level, rules.fx_above) {
                let mut total: i128 = 0;
                for hub in [rules.hub_a, rules.hub_b] {
                    let k = key(&cfg, hub);
                    let c = floor_grain(controller.get_collateral_amount(&id, &k));
                    if c >= MIN_MOVE {
                        let mut w = Vec::new(&e);
                        w.push_back((k, c));
                        let got = controller.withdraw(&user, &id, &w, &Some(user.clone()));
                        total += got.get(0).map(|(_, a)| a).unwrap_or(0);
                    }
                }
                if total <= 0 {
                    panic_with_error!(&e, RouterError::NothingMoved);
                }
                rules.fx_enabled = false;
                e.storage().persistent().set(&rk, &rules);
                Fired { user, account_id: id, branch: Symbol::new(&e, "fx_exit"), amount: total, from_hub: rules.hub_a, to_hub: rules.hub_b, observed: p.price, observed_2: rules.fx_level }.publish(&e);
                return Action::FxExit(total);
            }
        }

        Action::None
    }
}

impl NietRouter {
    fn move_collateral(e: &Env, cfg: &Config, controller: &ControllerClient, user: &Address, id: u64, from: u32, to: u32, amount: i128) -> i128 {
        let mut w = Vec::new(e);
        w.push_back((key(cfg, from), amount));
        let got = controller.withdraw(user, &id, &w, &Some(user.clone()));
        let received = floor_grain(got.get(0).map(|(_, a)| a).unwrap_or(0));
        if received < MIN_MOVE {
            panic_with_error!(e, RouterError::NothingMoved);
        }
        let mut s = Vec::new(e);
        s.push_back((key(cfg, to), received));
        controller.supply(user, &id, &cfg.spoke_id, &s);
        received
    }
}

#[cfg(test)]
mod test {
    use super::*;

    const BPS: i128 = RAY / 10_000;

    #[test]
    fn rebalance_needs_gap_and_collateral() {
        let ten = 10 * MIN_MOVE;
        assert_eq!(rebalance_direction(135 * BPS, 556 * BPS, 100, ten, 0), Some(true));
        assert_eq!(rebalance_direction(135 * BPS, 556 * BPS, 100, MIN_MOVE - 1, ten), None);
        assert_eq!(rebalance_direction(556 * BPS, 135 * BPS, 100, 0, ten), Some(false));
        assert_eq!(rebalance_direction(200 * BPS, 250 * BPS, 100, ten, ten), None);
        assert_eq!(rebalance_direction(0, 10 * RAY, 0, ten, ten), None);
    }

    #[test]
    fn grain_snapping() {
        assert_eq!(floor_grain(319_903_025), 319_900_000);
        assert_eq!(ceil_grain(319_903_025), 320_000_000);
        assert_eq!(ceil_grain(320_000_000), 320_000_000);
        assert_eq!(floor_grain(-5), 0);
    }

    #[test]
    fn fx_and_staleness() {
        assert!(fx_triggered(2_000_000_000_000, 2_049_800_000_000, false));
        assert!(!fx_triggered(2_100_000_000_000, 2_049_800_000_000, false));
        assert!(fx_triggered(51, 50, true));
        assert!(is_stale(1000, 100, 600));
        assert!(!is_stale(1000, 900, 600));
        assert!(!is_stale(100, 1000, 600));
    }
}
