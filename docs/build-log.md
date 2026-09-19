# Build log (after phase 0)

Continues `docs/phase0.md`. Same testnet, same headless wallet `CBHMG4IG...` (XOXNO account 12).

## Live contracts

| Contract | Address | Notes |
|---|---|---|
| `niet_router` (real) | `CBHRTWXARGZCUDBE7IX4SZV7GDFA6PRQICZQPUSOUPN3YDCVPXQBMT2P` | admin = keeper G-account, upgradeable in place (`upgrade`, `set_oracle`); wasm `b1d72bd1...` |
| `niet_agent_policy` | `CCEYSMIWTRJL7GE6G4MVKEC4NONUCTYVMZKMQH7D3PTQ7DPBLU5V3X4O` | unchanged since T7 |
| `niet_mock_fx` | `CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2` | Reflector read interface + `set_price`, admin = keeper; TRY quoted as USD per TRY, 14 decimals |
| router probe (phase 0) | `CA53BZYX...` | retired |

Wallet rules: `0:multisig` (passkey), `6:niet-agent-bhrtwx` (agent Ed25519 + policy allowlisting the real router's
`tick`, controller `withdraw`/`supply`/`repay`, USDC `transfer` -> pool only; 40 enforce calls per 2000 ledgers).

## Router (`contracts/niet_router`)

`set_rules(user, Rules)` passkey-signed; `tick(user) -> Action` agent-signed. Priority: health guard > rebalance >
FX exit > `None`. Reads: controller `get_health_factor` / `get_collateral_amount` / `get_borrow_amount`, pool
`get_deposit_rate` / `get_sync_data` / `get_supplied_amount` / `get_borrowed_amount`, oracle `lastprice` (Reflector
interface, staleness checked against `max_price_age_secs`). Emits `Fired { user, account_id, branch, amount,
from_hub, to_hub, observed, observed_2 }`. Pure decision helpers are unit-tested (`cargo test -p niet_router`).

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
stale niet-agent rules, `set_rules`).

Cron: there is no protocol-native scheduler on Soroban. SoroCron (testnet registry
`CDOAY46V2REWSINTZINUKTYELO5FYVEOCFWEKVMGH4BUJPSTRZTRGQ5W`) runs jobs through its own executor contract as the
invoker, so it cannot carry a user's smart-account authorization; Niet's keeper is required. SoroCron could poke a
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
