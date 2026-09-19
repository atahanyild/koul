ℹ️ Network: Test SDF Network ; September 2015
🌎 Downloading contract spec: CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3
#[soroban_sdk::contractargs(name = "Args")]
#[soroban_sdk::contractclient(name = "Client")]
pub trait Contract {
    fn pause(env: soroban_sdk::Env);
    fn repay(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        payments: soroban_sdk::Vec<(HubAssetKey, i128)>,
    );
    fn borrow(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        borrows: soroban_sdk::Vec<(HubAssetKey, i128)>,
        to: Option<soroban_sdk::Address>,
    );
    fn supply(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        spoke_id: u32,
        assets: soroban_sdk::Vec<(HubAssetKey, i128)>,
    ) -> u64;
    fn migrate(env: soroban_sdk::Env, new_version: u32);
    fn unpause(env: soroban_sdk::Env);
    fn upgrade(env: soroban_sdk::Env, new_wasm_hash: soroban_sdk::BytesN<32>);
    fn multiply(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        spoke_id: u32,
        collateral: HubAssetKey,
        debt_to_flash_loan: i128,
        debt: HubAssetKey,
        mode: PositionMode,
        swap: soroban_sdk::Bytes,
        initial_payment: Option<(HubAssetKey, i128)>,
        convert_swap: Option<soroban_sdk::Bytes>,
    ) -> u64;
    fn withdraw(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        withdrawals: soroban_sdk::Vec<(HubAssetKey, i128)>,
        to: Option<soroban_sdk::Address>,
    ) -> soroban_sdk::Vec<(HubAssetKey, i128)>;
    fn add_spoke(env: soroban_sdk::Env) -> u32;
    fn get_spoke(env: soroban_sdk::Env, spoke_id: u32) -> SpokeConfig;
    fn liquidate(
        env: soroban_sdk::Env,
        liquidator: soroban_sdk::Address,
        account_id: u64,
        debt_payments: soroban_sdk::Vec<(HubAssetKey, i128)>,
        seize_mode: SeizeMode,
    ) -> u64;
    fn swap_debt(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        existing_debt: HubAssetKey,
        amount: i128,
        new_debt: HubAssetKey,
        swap: soroban_sdk::Bytes,
    );
    fn create_hub(env: soroban_sdk::Env) -> u32;
    fn flash_loan(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        asset: HubAssetKey,
        amount: i128,
        receiver: soroban_sdk::Address,
        data: soroban_sdk::Bytes,
    );
    fn deploy_pool(
        env: soroban_sdk::Env,
        wasm_hash: soroban_sdk::BytesN<32>,
    ) -> soroban_sdk::Address;
    fn add_delegate(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        delegate: soroban_sdk::Address,
    );
    fn recapitalize(
        env: soroban_sdk::Env,
        payer: soroban_sdk::Address,
        hub_asset: HubAssetKey,
        amount: i128,
    ) -> i128;
    fn remove_spoke(env: soroban_sdk::Env, id: u32);
    fn upgrade_pool(env: soroban_sdk::Env, new_wasm_hash: soroban_sdk::BytesN<32>);
    fn __constructor(env: soroban_sdk::Env, admin: soroban_sdk::Address);
    fn claim_revenue(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        assets: soroban_sdk::Vec<HubAssetKey>,
    ) -> soroban_sdk::Vec<i128>;
    fn renew_account(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
    );
    fn account_exists(env: soroban_sdk::Env, account_id: u64) -> bool;
    fn clean_bad_debt(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
    );
    fn flash_position(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        spoke_id: u32,
        mode: PositionMode,
        debt: HubAssetKey,
        amount: i128,
        receiver: soroban_sdk::Address,
        data: soroban_sdk::Bytes,
        collaterals: soroban_sdk::Vec<(HubAssetKey, i128)>,
        refund_assets: soroban_sdk::Vec<soroban_sdk::Address>,
    ) -> u64;
    fn update_indexes(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        assets: soroban_sdk::Vec<HubAssetKey>,
    );
    fn get_app_version(env: soroban_sdk::Env) -> u32;
    fn get_spoke_asset(
        env: soroban_sdk::Env,
        spoke_id: u32,
        hub_asset: HubAssetKey,
    ) -> SpokeAssetConfig;
    fn get_spoke_usage(
        env: soroban_sdk::Env,
        spoke_id: u32,
        hub_asset: HubAssetKey,
    ) -> SpokeUsageRaw;
    fn is_liquidatable(env: soroban_sdk::Env, account_id: u64) -> bool;
    fn remove_delegate(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        delegate: soroban_sdk::Address,
    );
    fn set_accumulator(env: soroban_sdk::Env, addr: soroban_sdk::Address);
    fn swap_collateral(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        current: HubAssetKey,
        amount: i128,
        new: HubAssetKey,
        swap: soroban_sdk::Bytes,
    );
    fn accept_ownership(env: soroban_sdk::Env);
    fn get_market_index(env: soroban_sdk::Env, hub_asset: HubAssetKey) -> MarketIndexRaw;
    fn get_pool_address(env: soroban_sdk::Env) -> soroban_sdk::Address;
    fn price_aggregator(env: soroban_sdk::Env) -> soroban_sdk::Address;
    fn get_borrow_amount(
        env: soroban_sdk::Env,
        account_id: u64,
        hub_asset: HubAssetKey,
    ) -> i128;
    fn get_health_factor(env: soroban_sdk::Env, account_id: u64) -> i128;
    fn revoke_blend_pool(env: soroban_sdk::Env, pool: soroban_sdk::Address);
    fn add_asset_to_spoke(env: soroban_sdk::Env, input: SpokeAssetArgs);
    fn approve_blend_pool(env: soroban_sdk::Env, pool: soroban_sdk::Address);
    fn migrate_from_blend(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        spoke_id: u32,
        hub_id: u32,
        blend_pool: soroban_sdk::Address,
        collateral_assets: soroban_sdk::Vec<soroban_sdk::Address>,
        supply_assets: soroban_sdk::Vec<soroban_sdk::Address>,
        debt_caps: soroban_sdk::Vec<(soroban_sdk::Address, i128)>,
    ) -> u64;
    fn transfer_ownership(
        env: soroban_sdk::Env,
        new_owner: soroban_sdk::Address,
        live_until_ledger: u32,
    );
    fn deploy_position_nft(
        env: soroban_sdk::Env,
        wasm_hash: soroban_sdk::BytesN<32>,
        uri: soroban_sdk::String,
        name: soroban_sdk::String,
        symbol: soroban_sdk::String,
    ) -> soroban_sdk::Address;
    fn edit_asset_in_spoke(env: soroban_sdk::Env, input: SpokeAssetArgs);
    fn set_position_limits(env: soroban_sdk::Env, limits: PositionLimits);
    fn set_swap_aggregator(env: soroban_sdk::Env, addr: soroban_sdk::Address);
    fn get_total_borrow_usd(env: soroban_sdk::Env, account_id: u64) -> i128;
    fn set_position_manager(
        env: soroban_sdk::Env,
        manager: soroban_sdk::Address,
        is_active: bool,
    );
    fn set_price_aggregator(env: soroban_sdk::Env, addr: soroban_sdk::Address);
    fn upgrade_position_nft(
        env: soroban_sdk::Env,
        new_wasm_hash: soroban_sdk::BytesN<32>,
    );
    fn create_liquidity_pool(
        env: soroban_sdk::Env,
        hub_id: u32,
        asset: soroban_sdk::Address,
        params: MarketParamsRaw,
    ) -> soroban_sdk::Address;
    fn get_account_positions(
        env: soroban_sdk::Env,
        account_id: u64,
    ) -> (
        soroban_sdk::Map<HubAssetKey, AccountPositionRaw>,
        soroban_sdk::Map<HubAssetKey, DebtPositionRaw>,
    );
    fn get_collateral_amount(
        env: soroban_sdk::Env,
        account_id: u64,
        hub_asset: HubAssetKey,
    ) -> i128;
    fn set_spoke_asset_flags(
        env: soroban_sdk::Env,
        spoke_id: u32,
        hub_asset: HubAssetKey,
        paused: bool,
        frozen: bool,
        no_seize: bool,
    );
    fn get_account_attributes(
        env: soroban_sdk::Env,
        account_id: u64,
    ) -> AccountAttributes;
    fn get_ltv_collateral_usd(env: soroban_sdk::Env, account_id: u64) -> i128;
    fn is_blend_pool_approved(env: soroban_sdk::Env, pool: soroban_sdk::Address) -> bool;
    fn remove_asset_from_spoke(
        env: soroban_sdk::Env,
        hub_asset: HubAssetKey,
        spoke_id: u32,
    );
    fn force_socialize_bad_debt(env: soroban_sdk::Env, account_id: u64);
    fn get_liquidation_estimate(
        env: soroban_sdk::Env,
        account_id: u64,
        debt_payments: soroban_sdk::Vec<(HubAssetKey, i128)>,
        seize_mode: SeizeMode,
    ) -> LiquidationEstimate;
    fn get_total_collateral_usd(env: soroban_sdk::Env, account_id: u64) -> i128;
    fn update_account_threshold(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        has_risks: bool,
        account_ids: soroban_sdk::Vec<u64>,
    );
    fn get_liquidation_collateral(env: soroban_sdk::Env, account_id: u64) -> i128;
    fn repay_debt_with_collateral(
        env: soroban_sdk::Env,
        caller: soroban_sdk::Address,
        account_id: u64,
        collateral: HubAssetKey,
        collateral_amount: i128,
        debt: HubAssetKey,
        swap: soroban_sdk::Bytes,
        close_position: bool,
    );
    fn get_market_indexes_detailed(
        env: soroban_sdk::Env,
        hub_assets: soroban_sdk::Vec<HubAssetKey>,
    ) -> soroban_sdk::Vec<MarketIndexView>;
    fn set_spoke_liquidation_curve(
        env: soroban_sdk::Env,
        id: u32,
        target_hf_wad: i128,
        hf_for_max_bonus_wad: i128,
        liquidation_bonus_factor_bps: u32,
    );
    fn get_min_borrow_collateral_usd(env: soroban_sdk::Env) -> i128;
    fn set_min_borrow_collateral_usd(env: soroban_sdk::Env, floor_wad: i128);
    fn upgrade_liquidity_pool_params(
        env: soroban_sdk::Env,
        hub_asset: HubAssetKey,
        params: InterestRateModel,
    );
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct EventBorrowDelta(
    pub PositionAction,
    pub u32,
    pub soroban_sdk::Address,
    pub i128,
    pub i128,
    pub i128,
);
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct EventDepositDelta(
    pub PositionAction,
    pub u32,
    pub soroban_sdk::Address,
    pub i128,
    pub i128,
    pub i128,
    pub u32,
    pub u32,
    pub u32,
    pub u32,
);
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct EventAccountAttributes(
    pub soroban_sdk::Address,
    pub u32,
    pub EventPositionMode,
);
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct EventSpoke {
    pub hf_for_max_bonus_wad: i128,
    pub is_deprecated: bool,
    pub liquidation_bonus_factor_bps: u32,
    pub liquidation_target_hf_wad: i128,
    pub spoke_id: u32,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct SpokeConfig {
    pub hf_for_max_bonus_wad: i128,
    pub is_deprecated: bool,
    pub liquidation_bonus_factor_bps: u32,
    pub liquidation_target_hf_wad: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PaymentTuple {
    pub amount: i128,
    pub asset: soroban_sdk::Address,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct SpokeUsageRaw {
    pub borrowed_scaled_ray: i128,
    pub supplied_scaled_ray: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PositionLimits {
    pub max_borrow_positions: u32,
    pub max_supply_positions: u32,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct SpokeAssetArgs {
    pub asset: soroban_sdk::Address,
    pub bonus: u32,
    pub borrow_cap: i128,
    pub can_borrow: bool,
    pub can_collateral: bool,
    pub frozen: bool,
    pub hub_id: u32,
    pub liquidation_fees: u32,
    pub ltv: u32,
    pub no_seize: bool,
    pub paused: bool,
    pub spoke_id: u32,
    pub supply_cap: i128,
    pub threshold: u32,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct MarketIndexView {
    pub anchor_price_wad: i128,
    pub asset: soroban_sdk::Address,
    pub borrow_index: i128,
    pub deviation: bool,
    pub price_timestamp: u64,
    pub price_wad: i128,
    pub primary_price_wad: i128,
    pub stale: bool,
    pub supply_index: i128,
    pub valid: bool,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct SpokeAssetConfig {
    pub borrow_cap: i128,
    pub frozen: bool,
    pub is_borrowable: bool,
    pub is_collateralizable: bool,
    pub liquidation_bonus: u32,
    pub liquidation_fees: u32,
    pub liquidation_threshold: u32,
    pub loan_to_value: u32,
    pub no_seize: bool,
    pub paused: bool,
    pub supply_cap: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct AccountAttributes {
    pub mode: PositionMode,
    pub spoke_id: u32,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct LiquidationEstimate {
    pub bonus_rate_bps: i128,
    pub max_payment_wad: i128,
    pub protocol_fees: soroban_sdk::Vec<PaymentTuple>,
    pub refunds: soroban_sdk::Vec<PaymentTuple>,
    pub seized_collaterals: soroban_sdk::Vec<PaymentTuple>,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct HubAssetKey {
    pub asset: soroban_sdk::Address,
    pub hub_id: u32,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct MarketIndexRaw {
    pub borrow_index: i128,
    pub supply_index: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct DebtPositionRaw {
    pub scaled_amount: i128,
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
pub struct AccountPositionRaw {
    pub liquidation_bonus: u32,
    pub liquidation_fees: u32,
    pub liquidation_threshold: u32,
    pub loan_to_value: u32,
    pub scaled_amount: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum SeizeMode {
    Transfer,
    Credit(u64),
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum PositionAction {
    Supply = 0,
    Borrow = 1,
    Withdraw = 2,
    Repay = 3,
    LiqRepay = 4,
    LiqSeize = 5,
    Multiply = 6,
    ParamUpd = 7,
    SwDebtR = 8,
    SwColWd = 9,
    RpColWd = 10,
    RpColR = 11,
    CloseWd = 12,
    Migrate = 13,
    RpColNet = 14,
    LiqCredit = 15,
    FlashPos = 16,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum EventPositionMode {
    None = 0,
    Multiply = 1,
    Long = 2,
    Short = 3,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum PositionMode {
    Normal = 0,
    Multiply = 1,
    Long = 2,
    Short = 3,
}
#[soroban_sdk::contractevent(export = false, topics = ["debt", "bad_debt"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct CleanBadDebtEvent {
    pub account_id: u64,
    pub total_borrow_usd_wad: i128,
    pub total_collateral_usd_wad: i128,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "hub"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct CreateHubEvent {
    pub hub_id: u32,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "spoke"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdateSpokeEvent {
    pub spoke: EventSpoke,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "approve_blend_pool"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct ApproveBlendPoolEvent {
    pub pool: soroban_sdk::Address,
    pub approved: bool,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "remove_spoke_asset"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct RemoveSpokeAssetEvent {
    pub asset: soroban_sdk::Address,
    pub spoke_id: u32,
    pub hub_id: u32,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "spoke_asset"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdateSpokeAssetEvent {
    pub asset: soroban_sdk::Address,
    pub config: SpokeAssetConfig,
    pub spoke_id: u32,
    pub hub_id: u32,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "accumulator"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdateAccumulatorEvent {
    pub accumulator: soroban_sdk::Address,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "position_limits"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdatePositionLimitsEvent {
    pub max_supply_positions: u32,
    pub max_borrow_positions: u32,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "swap_aggregator"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdateSwapAggregatorEvent {
    pub swap_aggregator: soroban_sdk::Address,
}
#[soroban_sdk::contractevent(export = false, topics = ["config", "price_aggregator"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdatePriceAggregatorEvent {
    pub price_aggregator: soroban_sdk::Address,
}
#[soroban_sdk::contractevent(
    export = false,
    topics = ["config",
    "min_borrow_collateral",
    ]
)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdateMinBorrowCollateralEvent {
    pub min_borrow_collateral_usd_wad: i128,
}
#[soroban_sdk::contractevent(export = false, topics = ["market", "create"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct CreateMarketEvent {
    pub hub_id: u32,
    pub base_asset: soroban_sdk::Address,
    pub max_borrow_rate: i128,
    pub base_borrow_rate: i128,
    pub slope1: i128,
    pub slope2: i128,
    pub slope3: i128,
    pub mid_utilization: i128,
    pub optimal_utilization: i128,
    pub max_utilization: i128,
    pub reserve_factor: u32,
    pub market_address: soroban_sdk::Address,
}
#[soroban_sdk::contractevent(export = false, topics = ["market", "params_update"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdateMarketParamsEvent {
    pub hub_id: u32,
    pub asset: soroban_sdk::Address,
    pub max_borrow_rate: i128,
    pub base_borrow_rate: i128,
    pub slope1: i128,
    pub slope2: i128,
    pub slope3: i128,
    pub mid_utilization: i128,
    pub optimal_utilization: i128,
    pub max_utilization: i128,
    pub reserve_factor: u32,
}
#[soroban_sdk::contractevent(export = false, topics = ["account", "delegate"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct AccountDelegateEvent {
    pub account_id: u64,
    pub owner: soroban_sdk::Address,
    pub delegate: soroban_sdk::Address,
    pub granted: bool,
}
#[soroban_sdk::contractevent(export = false, topics = ["revenue", "claim"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct ClaimRevenueEvent {
    pub hub_id: u32,
    pub asset: soroban_sdk::Address,
    pub caller: soroban_sdk::Address,
    pub accumulator: soroban_sdk::Address,
    pub amount: i128,
}
#[soroban_sdk::contractevent(export = false, topics = ["position", "flash_loan"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct FlashLoanEvent {
    pub hub_id: u32,
    pub asset: soroban_sdk::Address,
    pub receiver: soroban_sdk::Address,
    pub caller: soroban_sdk::Address,
    pub amount: i128,
    pub fee: i128,
}
#[soroban_sdk::contractevent(export = false, topics = ["position", "liquidation"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct LiquidationEvent {
    pub liquidator: soroban_sdk::Address,
    pub account_id: u64,
    pub repaid_usd_wad: i128,
    pub bonus_bps: i128,
}
#[soroban_sdk::contractevent(export = false, topics = ["position", "flash_position"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct FlashPositionEvent {
    pub account_id: u64,
    pub hub_id: u32,
    pub asset: soroban_sdk::Address,
    pub receiver: soroban_sdk::Address,
    pub caller: soroban_sdk::Address,
    pub amount: i128,
    pub amount_received: i128,
    pub fee: i128,
}
#[soroban_sdk::contractevent(export = false, topics = ["position", "batch_update"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UpdatePositionBatchEvent {
    pub account_id: u64,
    pub account_attributes: EventAccountAttributes,
    pub deposits: soroban_sdk::Vec<EventDepositDelta>,
    pub borrows: soroban_sdk::Vec<EventBorrowDelta>,
}
#[soroban_sdk::contractevent(export = false, topics = ["strategy", "blend_migration"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct BlendMigrationEvent {
    pub account_id: u64,
    pub blend_pool: soroban_sdk::Address,
    pub collateral_count: u32,
    pub supply_count: u32,
    pub debt_count: u32,
}
#[soroban_sdk::contractevent(export = false, topics = ["strategy", "initial_payment"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct InitialMultiplyPaymentEvent {
    pub token: soroban_sdk::Address,
    pub amount: i128,
    pub account_id: u64,
}
#[soroban_sdk::contractevent(export = false, topics = ["ownership_transfer"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct OwnershipTransfer {
    pub old_owner: soroban_sdk::Address,
    pub new_owner: soroban_sdk::Address,
    pub live_until_ledger: u32,
}
#[soroban_sdk::contractevent(export = false, topics = ["ownership_transfer_completed"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct OwnershipTransferCompleted {
    pub new_owner: soroban_sdk::Address,
}
#[soroban_sdk::contractevent(export = false, topics = ["paused"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct Paused {}
#[soroban_sdk::contractevent(export = false, topics = ["unpaused"])]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct Unpaused {}

