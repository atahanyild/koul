# Koul backend plan and session state

Read this first in every session. Update the checklist and the "Where we are" line before ending a session. `README.md` is the run guide, `docs/` holds the logs with tx hashes. Frontend is being built by a teammate; this repo's job is the backend and a typed SDK the frontend consumes.

## Where we are

2026-09-20 (current): sections A, B, C are done and proven live (see `docs/build-log.md`, "Router v2", "Policy v2", "Keeper v2"). D1-D8 are implemented in `packages/core`: strict JSON schema, contract ScVal codec, validation, reads, unsigned writes, permissions, templates and frontend integration guide. D4/D5 are typechecked but have not had a live SDK smoke test. Next: E (sentence to rules), then F/G/H. The package is not yet wired into a workspace or the teammate's frontend. The `web/` prototype still speaks the old router and policy interfaces.

Earlier: the router is a rule engine on its fixed address; the policy is redeployed at `CBDQPSGJ...5AR2` with a pinned account id and a withdraw-recipient check; the keeper is stateless and the three scenarios fired through the new stack. Deviations from the sketch below, all deliberate: `tick` returns `Option<Executed {rule_index, kind, amount, from_hub, to_hub}>`; `check` returns `Vec<RuleState {ready, holds, conditions: Vec<ConditionState {holds, observed}>, last_fired}>`; `RepayWithCollateral(withdraw_hub, repay_hub, amount)` names both hubs; `KoulAgentParams` has `account_id`.

Earlier the same day: backend v1 complete (fixed three-branch router, keeper, policy, mock oracle, anchor both ways). Decisions taken with the user: router becomes a rule engine; cash out to TRY is a "withdraw to wallet, then user confirms cash out on the Funds page" flow (option A); AI sentence-to-rules uses a strict schema and a server route; the position NFT card is checked and dropped if none exists; the frontend is not our work.

## Decisions (do not reopen)

- Custody stays in the user's smart account; agent key + `koul_agent_policy` (Plan B). No vault.
- Rules are evaluated on-chain by the router. The keeper only submits `tick`.
- An autopilot is an ordered list of rules. On each tick the router checks rules top to bottom and runs the first one that is true, then stops. At most one action per tick.
- A rule has 1 to 3 conditions joined by all or any, one action, one cooldown. No if, no else.
- Cash out to TRY is never an agent action. A rule can withdraw to the wallet; the user confirms the TRY withdrawal with one passkey.
- Mock oracle on testnet, Reflector interface; `set_oracle` swaps it on mainnet.
- Product copy is English only.

## Rule engine: what we have and what we need

Have (`contracts/koul_router`): one `Rules` struct per user with fixed fields (`hub_a`, `hub_b`, `rebalance_threshold_bps`, `min_health_factor_wad`, `fx_enabled`, `fx_asset`, `fx_level`, `fx_above`, `max_price_age_secs`); `tick(user)` with a fixed priority health > rebalance > fx exit; amount helpers (`floor_grain`, `ceil_grain`, `withdrawable`, `MIN_MOVE`); `Fired` event; `upgrade`, `set_oracle`; 3 unit tests. Keeper ticks one hard-coded user. Policy allowlists `router.tick`, `controller.withdraw / supply / repay`, `usdc.transfer` to pool.

Need:

```
enum Cmp { Below, AtOrAbove }                       // two comparators are enough for every condition
enum Amount { All, Percent(u32 bps), Fixed(i128) }  // 7-decimal USDC for Fixed
enum Condition {
  HealthFactor { cmp, level_wad: i128 },
  SupplyRateGap { hub_over: u32, hub_under: u32, min_bps: u32 },   // rate(hub_over) - rate(hub_under) >= min_bps
  FxPrice { asset: Symbol, cmp, level: i128, max_age_secs: u64 },   // oracle lastprice, 14 decimals, USD per unit
  IdleBalance { cmp, amount: i128 },                                // USDC balance of the wallet
}
enum Action {
  MoveSupply { from_hub, to_hub, amount: Amount },
  RepayFromWallet { hub, amount: Amount },
  RepayWithCollateral { hub, amount: Amount },      // withdraw from hub then repay hub
  WithdrawToWallet { hub, amount: Amount },
}
struct Rule { conditions: Vec<Condition>, match_all: bool, action: Action, cooldown_ledgers: u32 }
struct Autopilot { account_id: u64, rules: Vec<Rule> }
storage: Autopilot(user, id) -> Autopilot; LastFired(user, id, rule_index) -> ledger; Ids(user) -> Vec<u32>; Users -> Vec<Address>
fns: set_autopilot(user, id, ap) [user auth], clear_autopilot(user, id) [user auth], get_autopilot, list_ids(user), list_users(),
     tick(user, id) -> Option<(u32 rule_index, Action)> [user auth, agent signs],
     check(user, id) -> Vec<Vec<bool>> [no auth, read-only: per rule, per condition truth] for live UI
event: Fired { user, autopilot_id, rule_index, action kind, amount, from_hub, to_hub, observed }
```

Constraints carried over: amounts snapped to 0.01 USDC, min move 1 USDC, repay rounded up one grain, withdrawals capped by hub cash and max utilisation, price staleness per condition, cooldown checked before evaluating conditions, `match_all` false means any.

## Checklist

### A. Router rule engine (`contracts/koul_router`)
- [x] A1 types above as `contracttype`s, storage keys, migrate constructor signature if needed
- [x] A2 `set_autopilot` / `clear_autopilot` / `get_autopilot` / `list_ids` / `list_users`, validation (1..=3 conditions, hubs differ for MoveSupply, cooldown > 0, max_age > 0, at most 8 rules)
- [x] A3 condition evaluation with the existing reads; `check` view
- [x] A4 `tick`: cooldown, first true rule, execute action with the existing amount logic, record LastFired, emit Fired
- [x] A5 unit tests for evaluation, ordering, cooldown, amount resolution
- [x] A6 build, upload, `upgrade` on `CBHRTWXA...`, log wasm hash in `docs/build-log.md`

### B. Policy hardening (`contracts/koul_agent_policy`)
- [x] B1 `withdraw` recipient check: controller `withdraw(user, id, entries, Some(to))` must have `to == smart_account` (today any `to` passes); same for any call that names a destination
- [x] B2 redeploy policy, new address in README, `keeper/.env`, `web/lib/koul.ts`; re-grant on the headless wallet

### C. Keeper (`keeper/`)
- [x] C1 iterate `list_users` x `list_ids`, tick each, per-autopilot log line
- [x] C2 `setup-rules.ts` becomes `setup-autopilot.ts` writing the "Lira shield" autopilot (five rules: health guard, rate gap both ways, FX exit per hub); `position.ts` and `policy-deny.ts` added
- [x] C3 rerun the three live scenarios (rebalance, fx exit, health guard) and record hashes in `docs/build-log.md`

### D. Typed SDK for the frontend (`packages/core`, published as a workspace package `@koul/core`)
- [x] D1 TypeScript types mirroring the contract types, plus `zod` schemas (the strict data type the LLM must produce)
- [x] D2 `encodeAutopilot(ap) -> ScVal`, `decodeAutopilot(ScVal) -> Autopilot`, round-trip tests
- [x] D3 `validateAutopilot(ap)` with the same limits the contract enforces, returning readable errors
- [x] D4 reads: `readPortfolio(address, accountId?)` (idle USDC, XLM, positions per hub, health factor, hub rates, cash, utilisation), `readOracle()`, `simulateTick(user, id)` (no signing, returns the action or none), `checkAutopilot(user, id)` (per condition truth), `readFired(user, startLedger)` events
- [x] D5 writes as unsigned `AssembledTransaction`s the frontend hands to `kit.signAndSubmit`: `buildSetAutopilot`, `buildClearAutopilot`, `buildGrantAgent`, `buildRevokeAgent`, `buildSupply`, `buildWithdraw`, `buildBorrow`, `buildTransfer`
- [x] D6 `permissionsFor(ap, contracts)` -> the minimal allowlist and the plain-English list for the arm sheet
- [x] D7 templates: Lira shield, Yield only, Health guard as `Autopilot` factories taking an account ID
- [x] D8 README section "Frontend integration" documenting D1 to D7 with examples

### E. Sentence to rules (`packages/core` + a server route the frontend app hosts)
- [ ] E1 prompt + tool definition: Claude receives the vocabulary and returns an `Autopilot` matching the zod schema via structured output; unknown or unsupported asks come back in a `notes[]` field, never invented
- [ ] E2 `parseAutopilot(text, context)` function taking live readings so defaults are sensible; validate with D3 before returning; mark defaulted fields
- [ ] E3 reference Next route handler `POST /api/autopilot/parse` in `web/app/api` that the teammate can copy, `ANTHROPIC_API_KEY` server-side only
- [ ] E4 tests with 6 sentences including one impossible ask

### F. Funds backend (anchor)
- [ ] F1 deposit and withdrawal as server functions in `packages/core/server` (moved from keeper scripts): create landing account, SEP-10/12/38/6, return a `transferId` and a status the UI polls, step by step
- [ ] F2 withdrawal step that needs the passkey returns an unsigned transfer tx for the frontend, then continues
- [ ] F3 reference route handlers `POST /api/funds/deposit`, `POST /api/funds/withdraw`, `GET /api/funds/:id`
- [ ] F4 "ready to cash out" detection: wallet idle USDC above a threshold after a `WithdrawToWallet` fired

### G. Oracle admin app (`oracle-admin/`)
- [ ] G1 move `web/app/oracle` and `web/app/api/oracle` into a separate Next app on port 3100, remove from `web/`

### H. Housekeeping
- [ ] H1 position NFT: check whether the testnet controller exposes a position NFT; note the answer in README
- [ ] H2 ship `web/.env.example` (gitignore pattern) or document only
- [ ] H3 keep README and this file current; update `docs/build-log.md` with every on-chain change

## Session protocol

1. Read `PLAN.md`, then `README.md` sections "Live testnet deployment" and "Running the stack locally".
2. `source scripts/env.sh`. Contracts build only with `stellar contract build`.
3. Work the checklist top to bottom unless the user reorders. Tick items here as they land.
4. Every on-chain change goes to `docs/build-log.md` with the tx hash. Every new address goes to README, `keeper/.env.example`, `web/lib/koul.ts`.
5. Commit locally with plain messages, no trailers. Push only when asked.
6. Before ending: update "Where we are" above.
