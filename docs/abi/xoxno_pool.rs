ℹ️ Network: Test SDF Network ; September 2015
🌎 Downloading contract spec: CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A
#[soroban_sdk::contractargs(name = "Args")]
#[soroban_sdk::contractclient(name = "Client")]
pub trait Contract {
    fn repay(
        env: soroban_sdk::Env,
        payer: soroban_sdk::Address,
        actions: soroban_sdk::Vec<PoolAction>,
    ) -> soroban_sdk::Vec<PoolPositionMutation>;
    fn borrow(
        env: soroban_sdk::Env,
        receiver: soroban_sdk::Address,
        entries: soroban_sdk::Vec<PoolBorrowEntry>,
    ) -> soroban_sdk::Vec<PoolPositionMutation>;
    fn supply(
        env: soroban_sdk::Env,
        entries: soroban_sdk::Vec<PoolSupplyEntry>,
    ) -> soroban_sdk::Vec<PoolPositionMutation>;
    fn upgrade(env: soroban_sdk::Env, new_wasm_hash: soroban_sdk::BytesN<32>);
    fn withdraw(
        env: soroban_sdk::Env,
        receiver: soroban_sdk::Address,
        is_liquidation: bool,
        entries: soroban_sdk::Vec<PoolWithdrawEntry>,
    ) -> soroban_sdk::Vec<PoolPositionMutation>;
    fn flash_loan(
        env: soroban_sdk::Env,
        hub_asset: HubAssetKey,
        initiator: soroban_sdk::Address,
        receiver: soroban_sdk::Address,
        amount: i128,
        data: soroban_sdk::Bytes,
    ) -> i128;
    fn net_settle(
        env: soroban_sdk::Env,
        entry: PoolNetSettleEntry,
    ) -> PoolNetSettleResult;
    fn get_revenue(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> i128;
    fn get_reserves(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> i128;
    fn recapitalize(
        env: soroban_sdk::Env,
        hub_asset: HubAssetKey,
        payer: soroban_sdk::Address,
        amount: i128,
    ) -> PoolAmountMutation;
    fn __constructor(env: soroban_sdk::Env, admin: soroban_sdk::Address);
    fn claim_revenue(
        env: soroban_sdk::Env,
        hub_asset: HubAssetKey,
    ) -> PoolAmountMutation;
    fn create_market(env: soroban_sdk::Env, hub_id: u32, params: MarketParamsRaw);
    fn get_sync_data(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> PoolSyncData;
    fn update_params(
        env: soroban_sdk::Env,
        hub_asset: HubAssetKey,
        model: InterestRateModel,
    );
    fn get_delta_time(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> u64;
    fn update_indexes(env: soroban_sdk::Env, hub_asset: HubAssetKey);
    fn create_strategy(
        env: soroban_sdk::Env,
        receiver: soroban_sdk::Address,
        action: PoolAction,
        charge_fee: bool,
    ) -> PoolStrategyMutation;
    fn get_borrow_rate(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> i128;
    fn get_utilisation(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> i128;
    fn seize_positions(env: soroban_sdk::Env, entries: soroban_sdk::Vec<PoolSeizeEntry>);
    fn get_bulk_indexes(
        env: soroban_sdk::Env,
        hub_assets: soroban_sdk::Vec<HubAssetKey>,
    ) -> soroban_sdk::Vec<MarketIndexRaw>;
    fn get_deposit_rate(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> i128;
    fn get_borrowed_amount(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> i128;
    fn get_supplied_amount(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> i128;
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolMarketStateEvent(
    pub u32,
    pub soroban_sdk::Address,
    pub u64,
    pub i128,
    pub i128,
    pub i128,
    pub i128,
    pub i128,
    pub i128,
);
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolMarketParamsEvent {
    pub asset: soroban_sdk::Address,
    pub hub_id: u32,
    pub params: MarketParamsRaw,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolAction {
    pub amount: i128,
    pub hub_asset: HubAssetKey,
    pub position: ScaledPositionRaw,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct HubAssetKey {
    pub asset: soroban_sdk::Address,
    pub hub_id: u32,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolStateRaw {
    pub borrow_index: i128,
    pub borrowed: i128,
    pub cash: i128,
    pub last_timestamp: u64,
    pub revenue: i128,
    pub supplied: i128,
    pub supply_index: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolSyncData {
    pub params: MarketParamsRaw,
    pub state: PoolStateRaw,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct MarketIndexRaw {
    pub borrow_index: i128,
    pub supply_index: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolSeizeEntry {
    pub hub_asset: HubAssetKey,
    pub position: ScaledPositionRaw,
    pub side: AccountPositionType,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct MarketParamsRaw {
    pub asset_decimals: u32,
    pub asset_id: soroban_sdk::Address,
    pub base_borrow_rate: i128,
    pub flashloan_fee: u32,
    pub is_flashloanable: bool,
    pub max_borrow_rate: i128,
    pub max_utilization: i128,
    pub mid_utilization: i128,
    pub optimal_utilization: i128,
    pub reserve_factor: u32,
    pub slope1: i128,
    pub slope2: i128,
    pub slope3: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolBorrowEntry {
    pub action: PoolAction,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolSupplyEntry {
    pub action: PoolAction,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct InterestRateModel {
    pub base_borrow_rate: i128,
    pub flashloan_fee: u32,
    pub is_flashloanable: bool,
    pub max_borrow_rate: i128,
    pub max_utilization: i128,
    pub mid_utilization: i128,
    pub optimal_utilization: i128,
    pub reserve_factor: u32,
    pub slope1: i128,
    pub slope2: i128,
    pub slope3: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolWithdrawEntry {
    pub action: PoolAction,
    pub protocol_fee: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct ScaledPositionRaw {
    pub scaled_amount: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolAmountMutation {
    pub actual_amount: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolNetSettleEntry {
    pub amount: i128,
    pub debt_position: ScaledPositionRaw,
    pub hub_asset: HubAssetKey,
    pub supply_position: ScaledPositionRaw,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolNetSettleResult {
    pub debt_position: ScaledPositionRaw,
    pub market_index: MarketIndexRaw,
    pub settled_amount: i128,
    pub supply_position: ScaledPositionRaw,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolPositionMutation {
    pub actual_amount: i128,
    pub asset_decimals: u32,
    pub market_index: MarketIndexRaw,
    pub position: ScaledPositionRaw,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolStrategyMutation {
    pub actual_amount: i128,
    pub amount_received: i128,
    pub asset_decimals: u32,
    pub market_index: MarketIndexRaw,
    pub position: ScaledPositionRaw,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum AccountPositionType {
    Deposit = 1,
    Borrow = 2,
}
#[soroban_sdk::contractevent(export = false, topics = ["strategy", "fee"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct StrategyFeeEvent {
    pub hub_id: u32,
    pub asset: soroban_sdk::Address,
    pub amount: i128,
    pub fee: i128,
    pub amount_sent: i128,
}
#[soroban_sdk::contractevent(export = false, topics = ["market", "batch_state_update"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolMarketStateBatchEvent {
    pub updates: soroban_sdk::Vec<PoolMarketStateEvent>,
}
#[soroban_sdk::contractevent(export = false, topics = ["market", "batch_params_update"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PoolMarketParamsBatchEvent {
    pub updates: soroban_sdk::Vec<PoolMarketParamsEvent>,
}

