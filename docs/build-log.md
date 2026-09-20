# Build log (after phase 0)

Continues `docs/phase0.md`. Same testnet, same headless wallet `CBHMG4IG...` (XOXNO account 12).

## Live contracts

| Contract | Address | Notes |
|---|---|---|
| `koul_router` (real) | `CBHRTWXARGZCUDBE7IX4SZV7GDFA6PRQICZQPUSOUPN3YDCVPXQBMT2P` | admin = keeper G-account, upgradeable in place (`upgrade`, `set_oracle`); wasm `b1d72bd1...` (v1, fixed branches) then `2c8448d6...` (rule engine, 2026-09-20) |
| `koul_agent_policy` | `CCEYSMIWTRJL7GE6G4MVKEC4NONUCTYVMZKMQH7D3PTQ7DPBLU5V3X4O` | unchanged since T7 |
| `koul_mock_fx` | `CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2` | Reflector read interface + `set_price`, admin = keeper; TRY quoted as USD per TRY, 14 decimals |
| router probe (phase 0) | `CA53BZYX...` | retired |

Wallet rules: `0:multisig` (passkey), `6:koul-agent-bhrtwx` (agent Ed25519 + policy allowlisting the real router's
`tick`, controller `withdraw`/`supply`/`repay`, USDC `transfer` -> pool only; 40 enforce calls per 2000 ledgers).

## Router (`contracts/koul_router`)

`set_rules(user, Rules)` passkey-signed; `tick(user) -> Action` agent-signed. Priority: health guard > rebalance >
FX exit > `None`. Reads: controller `get_health_factor` / `get_collateral_amount` / `get_borrow_amount`, pool
`get_deposit_rate` / `get_sync_data` / `get_supplied_amount` / `get_borrowed_amount`, oracle `lastprice` (Reflector
interface, staleness checked against `max_price_age_secs`). Emits `Fired { user, account_id, branch, amount,
from_hub, to_hub, observed, observed_2 }`. Pure decision helpers are unit-tested (`cargo test -p koul_router`).

Two protocol constraints learned the hard way, both now handled inside the router:

1. **Amounts must be identical at simulation and execution.** The smart account's auth tree bakes the exact args
   of every sub-invocation. Positions accrue interest every ledger, so `withdraw(get_collateral_amount())` was
   rejected by the controller with `Unauthorized function call` at execution (tx `cac31068...`). Every amount is
   now snapped to 0.01 USDC (`floor_grain` / `ceil_grain`), moves under 1 USDC are ignored (`MIN_MOVE`), and repay
   rounds the debt up (the controller refunds excess).
2. **A hub only releases its liquid cash, and never past the utilisation ceiling.** XOXNO pool errors
   `InsufficientLiquidity` (112: `cash >= amount`) and `UtilizationAboveMax` (127: `borrowed / (supplied - w) <=
   max_utilization`). `withdrawable()` caps every withdrawal by both, minus one grain of margin, reading
   `max_utilization` from `get_sync_data`. FX exit pulls what is liquid, stays armed while >= 1 USDC remains.

## Keeper (`keeper/src/keeper.ts`)

Every N seconds, per user: build `router.tick(user)` with the keeper G-account as source (this simulates), skip on
simulation error or `Action::None` (no fee), otherwise sign the smart-account auth entry with the agent key,
`context_rule_ids = [rule] * contexts`, submit, log the on-chain result. `pnpm tsx src/keeper.ts --once` for one
pass, `--interval 30` for the loop. Setup for a user: `pnpm tsx scripts/setup-rules.ts` (passkey: grant rule, remove
stale koul-agent rules, `set_rules`).

Cron: there is no protocol-native scheduler on Soroban. SoroCron (testnet registry
`CDOAY46V2REWSINTZINUKTYELO5FYVEOCFWEKVMGH4BUJPSTRZTRGQ5W`) runs jobs through its own executor contract as the
invoker, so it cannot carry a user's smart-account authorization; Koul's keeper is required. SoroCron could poke a
permissionless entry point later (roadmap).

## Live runs (2026-09-20)

| Run | Router decision | Tx | Result |
|---|---|---|---|
| rebalance, gap hub2 5.56 % vs hub1 1.35 % > 100 bps | `Rebalance(1 -> 2, 31.99 USDC)` | `e3b7a9bcac4ddf61738086ffdff1aba521ed1aa3eb79ae594dc47c2aeb59c0da` | hub1 0.0003, hub2 49.99 |
| next tick | `None` | none | idempotent |
| mock price set to 0.0199 USD/TRY (level 0.0200, `fx_above=false`) | `FxExit(26.82 USDC)`: hub 2 had 12 USDC lent out, cap = cash and 95 % utilisation | `dbd7bbc882aa5bff4af270c6105573760ee110307823a4b6a6c8cd559e0d8fed` | wallet 27.82 USDC idle, hub2 23.17 left, rule still armed |
| next tick | `None` (no liquid cash to pull) | none | |

| passkey borrow 16 USDC from hub 1 (`b7771a7e...`), health factor 1.1585 < 1.25 | `Repay(1, 16.01 USDC)` from idle wallet USDC | `16911f1d8511420e...` (second tick; the first re-simulation caught the debt drifting past a rounding boundary, fixed by adding one grain of margin, router wasm `f14369a5...`) | debt 0, health factor back to infinity, wallet 27.82 USDC |

Rule set on-chain: account 12, hubs 1/2, 100 bps threshold, min health factor 1.25 (WAD), FX exit when USD per TRY
<= 0.0200 (USD/TRY >= 50), max price age 900 s. Mock price reset to 0.020498 afterwards.

Failed attempts, kept for the record: `cac31068...` (arg drift, above), `53c38522...` (keeper submitted a tick
whose simulation had failed; the keeper now refuses to submit in that case).

## Anchor withdrawal from the contract wallet: PASS (2026-09-20, `keeper/scripts/anchor-withdraw.ts`)

Kumbara's reverse landing account, with the keeper G-account as sponsor and a local fee-bump relay
(`keeper/src/anchor/local-relay.ts`) instead of the hosted relay. 2 USDC -> 97.08 TRY.

| Step | Tx / id |
|---|---|
| landing account (ownerless after lock) | `GDASMEJZBZZDVWMZYEKROKC53ILUZKXT2MIELG2EOAZ5XKZTFIMAGSW2`, create `62fa8f2f...`, lock `9045d76f...` |
| SEP-10 as the landing account (1 challenge signed), SEP-12, SEP-38 sell quote | `qt_ym1tw3u5ou7c2j8d3bqx`: 2.0000000 USDC -> 97.08 TRY |
| SEP-6 withdraw-exchange | `sep_s2igb4z11xcmisqugudx`, treasury `GCLCZEQZ...`, memo id `166956551683` |
| smart account -> landing SAC transfer (passkey) | `8d473020af5230197ec9140ce62d40f4bdb7a04aa0ccef4675d6d45fdc4014cb` |
| pre-authorized classic payment to the treasury with the memo, fee-bumped by the keeper | `2a5be8866b8359602072fcc3f1dfadf9073ae996bff318d8075b230ba64a98c7` |
| anchor matched and paid | `completed`, `FAST-OR36GGTULN`, "TRY paid to TR33...1326 via FAST (simulated)" in ~6 s |
| cleanup (trustline off, merge to sponsor) | `e070a0939a5ce1c0cd90968a597258e58b2a884a8d41ca9158adc05858a67def` |

For the FX-exit product flow the keeper runs exactly this after the router's `fx_exit` event, with the withdrawn
amount, and the SAC transfer to the landing account is the one step that still needs the passkey (the policy only
allows agent transfers to the pool). Option for later: let the router's FX branch transfer to a landing account the
keeper names, allowlisted per tick; not done.

## Still open

- Sembol PR (grant / revoke screens), real Face ID wallet, frontend and activity feed from `Fired` events.
- Demo script: rebalance needs a fresh rate gap (borrow/repay from account 23); FX exit needs `set_price` on the
  mock oracle; health guard needs a passkey borrow (`scripts/demo-health.ts`).

## Frontend, oracle admin, Sembol PR (2026-09-20)

**`web/`** (Next.js 16, `@sembol/passkey-react` 0.4.0 with the testnet preset and its public SDF relayer, so wallet
creation and every passkey-signed call are fee-sponsored): `/` = create/connect passkey wallet, XLM + USDC balances,
**Agent access** (grant the keeper key under `koul_agent_policy` with a 1/7/30-day expiry, list, revoke),
**Strategy** (router `set_rules` with a passkey), **Activity** (router `Fired` events for this wallet, decoded into
sentences). `/oracle` = mock FX admin: current USD/TRY, age, `Set price`, presets (48.79 calm, 50.25 shock,
publish stale). The price write goes through `POST /api/oracle`, the only server-side secret (`ORACLE_ADMIN_SECRET`
in `web/.env.local`). Run: `cd web && pnpm dev -p 3210` (port 3000 is taken by another project on this machine).
Verified in Chrome: pages render without console errors; the oracle panel set the price on-chain from the browser.

**Keeper feed:** the keeper republishes the mock TRY price whenever it is older than 10 min, so the router's 900 s
staleness guard never trips outside a deliberate "publish stale" demo.

**Sembol PR:** https://github.com/keyboord01/sembol/pull/3, from fork `atahanyild/sembol`, branch
`feat/agent-permissions`. Adds `useAgentPermission()`, `<GrantAgentAccess />`, `<AgentPermissions />`,
`agentKeyBytes`, `findAgentRules`; 7 tests (suite 120/120), Storybook stories, README, CHANGELOG. Contract-free.
The Koul web app inlines the same logic against the published 0.4.0 until the PR is released.

**Not yet exercised: a real Face ID passkey in a browser.** Everything else in the chain (this wallet wasm, the
WebAuthn verifier, `rules.add` with a custom policy, agent signing, revoke) ran on-chain with a software passkey.
The remaining check is a human pressing "Create wallet" at `http://localhost:3210`.

## Router v2: rule engine (2026-09-20)

`contracts/koul_router` rewritten as a data-driven rule engine (PLAN.md section A). Same address, upgraded in place.

| Step | Result |
|---|---|
| `stellar contract upload` | wasm `2c8448d6189cb23ce096ef30291bb6223bae74a7b87d20648d6bbd6fabd5a661`, tx `ebeef0dfa5631734646bcd8cfbef0db12a65d4cd581fe3dce3d6f1a40547fe19` |
| `upgrade(new_wasm_hash)` by the keeper admin | tx `2afcf35e5245fda5dc4a1ae9d70da04a65352ad3240b3ff22c65c96fa5f71479` |
| after upgrade | `list_users() = []`, `get_config` unchanged, `list_ids(CBHMG4IG...) = []`; the v1 `Rules(user)` entry is orphaned and ignored |

Interface: `set_autopilot(user, id, Autopilot)` / `clear_autopilot(user, id)` (user auth), `get_autopilot`,
`list_ids(user)`, `list_users()`, `check(user, id) -> Vec<RuleState>` (read-only, per rule: ready, holds, per
condition holds + observed value, last fired ledger), `tick(user, id) -> Option<Executed>` (user auth via the agent
rule). Types: `Cmp {Below, AtOrAbove}`, `Amount {All, Percent(bps), Fixed(i128)}`, `Condition {HealthFactor(cmp,
wad), SupplyRateGap(hub_over, hub_under, min_bps), FxPrice(symbol, cmp, level, max_age_secs), IdleBalance(cmp,
amount)}`, `Action {MoveSupply(from, to, amt), RepayFromWallet(hub, amt), RepayWithCollateral(withdraw_hub,
repay_hub, amt), WithdrawToWallet(hub, amt)}`, `Rule {conditions, match_all, action, cooldown_ledgers}`,
`Autopilot {account_id, rules}`. Limits enforced on-chain: 1..=8 rules, 1..=3 conditions, cooldown > 0, hubs differ
for moves and rate gaps, percent 1..=10000 bps, fixed >= 1 USDC, positive levels. Events: `AutopilotSet`,
`AutopilotCleared`, `Fired {user, autopilot_id, rule_index, kind, amount, from_hub, to_hub, observed[]}`.

Semantics: rules are walked top to bottom; a rule still in cooldown is skipped; a rule whose conditions hold but
whose action resolves to nothing (no collateral, no debt, empty wallet, illiquid hub) is skipped and the next rule is
tried; the first rule that executes ends the tick. Stale or missing oracle prices make `FxPrice` false instead of
panicking. Tests: 8 (helpers, validation, registries, and three scenario tests against mock controller / pool /
oracle with a real Stellar asset contract).

The keeper and `setup-rules.ts` still speak the v1 interface at this point; section C updates them.
