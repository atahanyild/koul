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

## Policy v2: pinned account and withdraw recipient (2026-09-20)

`contracts/koul_agent_policy` gained `account_id` in `KoulAgentParams` and three checks in `enforce`: controller
`withdraw` / `supply` / `repay` must name the pinned account (`7108 AccountNotAllowed`), and `withdraw`'s `to` must be
`None` or the smart account (`7109 WithdrawRecipientNotAllowed`). `TransferArity` became `Arity` (7105). New
deployment, the old policy address is retired.

| Step | Result |
|---|---|
| deploy | `CBDQPSGJDJUGLUIYTLAVH7C7FQE3ZN2HXOKYELNPEEUHFPV52QRI5AR2`, wasm `ad6bddd7...`, tx `5bedc8b6ccb9379f6851e111c845db8a1604931ed40d2389e15eb72b6318938e` |
| `rules.add` koul-agent-bhrtwx (agent key + policy v2, account 12, 1 day) on `CBHMG4IG...` | rule id 7, tx `1df68d4c29d32856e497113cdb7ac72305d7fb9ea78c253b95ee9624434f0c64` |
| `rules.remove` 6 niet-agent-bhrtwx (policy v1) | tx `69b61e662ffa6d9f15f54f30459b310f0376991222bde5150616bfdc2b92af89` |
| agent-signed `controller.withdraw(..., to = GBRXD5JO...)` | rejected in simulation with `#7109` |
| agent-signed `controller.repay(wallet, 23, ...)` | rejected in simulation with `#7108` |
| agent-signed `controller.borrow(...)` | rejected in simulation with `#7103` (not allowlisted) |
| agent-signed `controller.withdraw(..., to = wallet)` (control) | submitted `b7ec85ab58ff00f80e2c80aba098c7f8f26d4a2d9e2f518d224f8fbff09b2c5e`, `4389e4cc3007534e1a63b73cd4693f378ae36fe4fda9da5754a2a30e8c63b0ba` |

Wallet rules now: `0:multisig` (passkey), `7:koul-agent-bhrtwx`. `pnpm policy-deny` reruns the four checks. XOXNO
itself refuses `supply` into an account the caller does not own (`#44`), so the account pin only adds a second
line of defence there; for `repay` it is the only one.

Note on testing the policy: a call XOXNO rejects in simulation never reaches `__check_auth`, and the kit then submits a
transaction without auth entries which the network answers with `txMALFORMED`. `policy-deny` checks the simulation
first and reports "policy not reached" instead.

## Keeper v2 and the three scenarios on the rule engine (2026-09-20)

`keeper/src/keeper.ts` is stateless: `router.list_users()` x `router.list_ids(user)`, one `tick(user, id)` each,
agent rule id read from the wallet's context rules, `check(user, id)` logged when a tick is `None` (`--quiet` to skip).
`scripts/setup-autopilot.ts` replaces `setup-rules.ts`; `scripts/position.ts` (passkey supply / borrow / repay /
withdraw / show) replaces `demo-health.ts`; `scripts/tx-diag.ts <hash>` prints a failed transaction's diagnostics.

| Step | Result |
|---|---|
| `set_autopilot(CBHMG4IG..., 1, Lira shield)` (passkey): 5 rules, health guard 1.25 / rate gap 100 bps both ways / FX exit both hubs at USD per TRY < 0.0200 | tx `dd4ca8a0320c2c3ec272a6722b421481c33b5b25914a620a139b8f94b93c69b0` |
| keeper pass, nothing to do | `tick -> None; r0[-inf] r1 HOLDS[+8080] r2[--8080] r3[-2049600327936] r4[-2049600327936]`: rule 1 holds (hub 2 pays 80.8 % more) but hub 1 is empty, so it falls through |
| passkey `supply 10 USDC hub 1` | tx `4c55f8be67685d6a07560d7402ac1ea1b9b8b5d29213861c1ed29eedac968648` |
| **rebalance**: `move_supply rule 1 amount 10.00 USDC hub 1 -> 2` | tx `ca977dc98bc9f2bc7ac169039bea1c69c1ea06730e541044b2a3996896076d88` |
| passkey `borrow 16` + `borrow 6` from hub 1, health factor 1.2064 | txs `b0612abf...`, `b386c713...` |
| health guard, first attempt | FAILED `5073c3ca7faebae0280410491dcd067e2c193fd03379f99b2693ec1878ff18bf`: XOXNO `get_health_factor` reads Reflector `prices` at a 5-minute round key; the round changed between simulation and execution ("trying to access contract data key outside of the footprint"). Timing, not logic; the next tick retries |
| **health guard**: `repay_wallet rule 0 amount 22.02 USDC hub 1` | tx `1977c549c73b182800d43261042e365de89ff07e77e5848400729df465b0cfd7`, debt 0, health factor back to infinity |
| mock oracle `set_price` TRY 0.0199 | tx `28e5b50a27f4c13b89701c6368f8807f299871cd0007c2ba28c72d206c50c825` |
| **FX exit**: rule 3 (hub 1) skipped as empty, `withdraw rule 4 amount 10.00 USDC hub 2` (capped by hub 2's 95 % utilisation ceiling, 23.18 stays) | tx `2f37d8b44b2b902bed140d02fc593c692cdcaa50038a3a0c4d0a39a20bc09cd9` |
| mock oracle `set_price` back to 0.0205 | tx `2c5b7a1dd2d9736a10af3e03a23ef9a7c4766a082123b04c494f6af7e7831bed` |

Position after the run: hub 1 0 USDC, hub 2 23.18 USDC (hub 2 is at its utilisation ceiling, borrower account 23
owes 12 USDC there), wallet 23.82 USDC idle, no debt. The `web/` prototype still speaks the v1 router interface and
the v1 policy params; it is rewired to `@koul/core` in section D.

## SDK live smoke test and position NFT (2026-09-20)

`packages/core` `pnpm smoke` runs `KoulReader` and `KoulWriter` against testnet on the headless wallet (read-only,
writes simulated, nothing signed). Results: `readPortfolio` account 12, idle 25.82 USDC, hubs with collateral, debt,
rates, utilisation; `readOracle` TRY 0.02049600 (14 decimals), age reported; `checkAutopilot` five rule states with
observed values; `simulateTick` null (nothing to do); `validateAutopilot(liraShield)` no errors; codec round trip
equal; `buildSetAutopilot` simulates with one auth entry for the wallet; `buildWithdraw` from hub 2 simulates to XOXNO
`#127` because hub 2 sits at its utilisation ceiling (expected, not an SDK fault).

Two fixes from the run: `readFired` returned nothing for a 17280-ledger range because the RPC answers wide ranges
with an empty list (a 5000-ledger range returned the events); it now walks 5000-ledger windows with cursor paging and
skips router v1 `Fired { branch }` events. Verified: three events, `move_supply` / `repay_wallet` / `withdraw` with
the hashes above.

Position NFT (PLAN H1): XOXNO's `get_health_factor` calls `owner_of(12)` on
`CDVN5JU675MEDPVRPCYC45AHFC275UH57WEU5OTFE4WFGZBNN7HTLPSY` = "XOXNO Lending Position" (`XLEND`), total supply 14.
`owner_of(12)` = the headless wallet, `balance(wallet)` = 1, `get_owner_token_id(wallet, 0)` = 12, `token_uri(12)` =
`https://api.xoxno.com/user/lending/image/12?isStatic=true&chain=STELLAR` (HTTP 200, `image/svg+xml`, 86 KB).
`KoulReader.readPositionNft(address)` added.

## FundsService deposit smoke, stopped at anchor (2026-09-20)

The new `FundsService.createDeposit` was exercised with 100 simulated TRY for the headless wallet. It created ownerless
landing account `GA2JQQPGSDANJELXGEGGIOCEENQZXTA57SQ6MWBQAM7YW67DQZESJVUY` and locked its pre-authorized
forward/cleanup envelopes. The SEP-38 quote expected 2.0396090 USDC. The sandbox bank-transfer hook accepted the
payment (a second call returned HTTP 409, "This deposit already received its bank transfer"), but SEP-6 remained
`pending_anchor` with "TRY received; paying USDC on Stellar." Polling was stopped at the user's request to ignore the
broken anchor. No forward or cleanup was submitted, and no wallet funds were moved by this run.

| Step | Testnet transaction |
|---|---|
| landing account created | `4f00f3922edbd7cd3cbc2b1aadd37a80e9d5704e2fcfe9eed06ce1f44750de1e` |
| pre-authorized envelopes locked | `e52080b23bfd58fc4d4bc2411e660e2a7c214d5c39fcecef0711901f79d91fb4` |

Transfer ID `7eb83fc2-c8a3-4922-9357-87e867c2b648` has a private local record at
`/private/tmp/koul-funds-smoke/7eb83fc2-c8a3-4922-9357-87e867c2b648.json`. It contains the SEP bearer token and
pre-authorized envelopes, so do not publish the record. Resume or abort only after the anchor is healthy.
