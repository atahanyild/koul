# Koul

Conditional portfolio autopilot on XOXNO lending, on Stellar testnet. Built for the Rise In x Stellar Pro Hackathon (Istanbul, 19 to 20 September 2026, Scale track).

A user creates a passkey smart wallet, brings Turkish lira in through an anchor, and writes rules such as "keep my USDC in whichever hub pays more, repay before liquidation, and pull everything back to the wallet if USD/TRY passes 50". The rules are stored in and evaluated by an on-chain router contract. An off-chain keeper only pokes the router with an agent key that the user's wallet has confined to a fixed list of contract calls. The user's funds never leave the user's own wallet or their XOXNO position.

This document covers everything built so far and how to run it. Design work for the product UI is tracked separately and is not part of this document.

## Contents

1. [What exists today](#what-exists-today)
2. [Architecture](#architecture)
3. [Live testnet deployment](#live-testnet-deployment)
4. [Repository layout](#repository-layout)
5. [Running the stack locally](#running-the-stack-locally)
6. [Demo scenarios](#demo-scenarios)
7. [Findings and constraints](#findings-and-constraints)
8. [Phase 0 gates](#phase-0-gates)
9. [Open items](#open-items)

## What exists today

Everything below runs on testnet and has transaction hashes recorded in `docs/phase0.md` and `docs/build-log.md`.

- **Smart wallet with an agent session key.** OpenZeppelin smart account (the same wasm that Sembol and smart-account-kit deploy, reproduced byte for byte). Rule 0 is the user's passkey. A second rule holds the keeper's Ed25519 key and binds it to `koul_agent_policy`, a custom policy contract that allowlists exactly five calls, restricts USDC transfers to the XOXNO pool, rate limits, and expires. Grant, use, deny and revoke are all proven on-chain.
- **Router contract (`koul_router`).** Stores one rule set per user. `tick(user)` reads XOXNO health factor, positions, hub rates and an FX oracle, then executes at most one branch in priority order: health guard (repay from idle wallet USDC), rebalance between two USDC hubs when the supply rate gap passes a threshold, FX exit (withdraw to the wallet when USD/TRY crosses a level), or nothing. All three branches have executed live.
- **Keeper (`keeper/`).** A TypeScript loop that simulates `tick` for each user, skips when the router says none, and otherwise signs the smart account auth entry with the agent key and submits. It never holds user funds and never pays for a transaction that would fail. It also keeps the mock oracle fresh.
- **Mock FX oracle (`koul_mock_fx`).** Reflector's read interface with an admin `set_price`, because no Reflector testnet feed lists TRY. Swappable for the real Reflector contract on mainnet through `set_oracle` on the router.
- **Anchor integration, both directions.** The TR Mock Anchor rejects contract addresses, so Kumbara's ownerless landing account pattern is ported verbatim into `keeper/src/anchor/`. TRY deposit into the smart wallet and USDC withdrawal to TRY from the smart wallet both completed on testnet.
- **Utilisation on the pool.** A second identity supplies XLM collateral and borrows USDC on hub 2, so hub rates differ and the rebalance branch fires on live data.
- **Experimental web app (`web/`).** Next.js 16 with Sembol passkeys: create or connect a wallet, grant and revoke the agent, save the rule set, see executed branches, plus a mock oracle admin panel. Verified in Chrome. This is the pre-design prototype and will be replaced by the designed app.
- **Sembol contribution.** Pull request https://github.com/keyboord01/sembol/pull/3 adds `useAgentPermission`, `GrantAgentAccess` and `AgentPermissions` to `@sembol/passkey-react`, with tests, stories and docs.

## Architecture

```
                         passkey (Face ID / Touch ID)
                                   |
   +-------------------------------v-----------------------------------+
   |  User smart account (OpenZeppelin, deployed by Sembol / kit)       |
   |  rule 0: WebAuthn passkey                                          |
   |  rule N: agent Ed25519 key + koul_agent_policy                     |
   |          allowed: router.tick, controller.withdraw/supply/repay,   |
   |                   usdc.transfer -> XOXNO pool only                 |
   +---------+-------------------------------------------+-------------+
             |  set_rules (passkey)                        |  tick (agent key, keeper submits)
             v                                             v
   +---------------------------+                +------------------------------+
   |  koul_router              |  reads         |  XOXNO controller + pool     |
   |  Rules per user           +--------------->|  health factor, positions,   |
   |  tick: health > rebalance |  calls         |  supply rates, cash          |
   |        > fx exit > none   +--------------->|  withdraw / supply / repay   |
   +-------------+-------------+                +------------------------------+
                 |  reads
                 v
   +---------------------------+
   |  koul_mock_fx (Reflector  |   <- keeper set_price (testnet only)
   |  interface, USD per TRY)  |
   +---------------------------+

   keeper (Node):  every N s: simulate tick -> if action, sign auth entry with agent key -> submit
   anchor (Node):  landing account per transfer: SEP-10/12/38/6, pre-authorised forward and cleanup
```

Two signing paths exist and only two.

- **Passkey path.** The kit builds the transaction, simulates it, hashes the resulting auth entry, and uses that hash as the WebAuthn challenge. Face ID signs. The assertion is packed into the auth entry and the account's `__check_auth` verifies the P-256 signature against the stored credential through the WebAuthn verifier contract. Used for: wallet creation, agent grant and revoke, saving rules, the first supply, borrowing, and the one transfer to a landing account on withdrawal.
- **Agent path.** Same transaction shape, but the keeper's Ed25519 key signs the auth digest with one `context_rule_id` per call in the authorization tree. `__check_auth` finds the agent rule, verifies the signature, and runs `koul_agent_policy.enforce` once per call. Used for every router tick. The user is never prompted.

## Live testnet deployment

| Item | Address or value |
|---|---|
| Router `koul_router` | `CBHRTWXARGZCUDBE7IX4SZV7GDFA6PRQICZQPUSOUPN3YDCVPXQBMT2P` (admin is the keeper G-account, upgradeable in place with `upgrade`, keep this address) |
| Agent policy `koul_agent_policy` | `CBDQPSGJDJUGLUIYTLAVH7C7FQE3ZN2HXOKYELNPEEUHFPV52QRI5AR2` |
| Mock FX oracle `koul_mock_fx` | `CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2` |
| Headless test wallet (software passkey) | `CBHMG4IGCLP36WJUMYR55N2TGDSZ4C5V6YQSBT4HWT6A77DCL3Y7UUFL`, XOXNO account 12, rules `0:multisig` and `7:koul-agent-bhrtwx` |
| Keeper G-account (fees, sponsor, oracle admin, router admin) | `GAFHZTSL63YZYU35SCHDOGOMXQ25266DBQYG7KETG6HC2AHBIZMGXP6U` |
| Agent Ed25519 public key | `GBVD753EJMRQYI6WQCWC4OMDCNMGQMHXRT7IOAHTT3FD7ON6OQXTSAK3` |
| Borrower identity (creates utilisation) | `GBRXD5JOT5YV6U3VFZ4ESR6MPCLJ3MSP55SUQNKSK23465U34M6H5EZJ`, XOXNO account 23, 2000 XLM collateral, 12 USDC borrowed on hub 2 |
| XOXNO controller | `CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3` |
| XOXNO pool | `CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A` |
| USDC SAC (anchor's and XOXNO's, same contract) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| XOXNO spoke, hubs | spoke 3, hub 1 = USDC, hub 2 = USDC_HUB2 |
| Anchor | `tr-mock-anchor.fly.dev`, asset USDC |
| Retired phase 0 probes | router probe `CA53BZYX...`, noop policy `CA4TJH2W...`, deny policy `CB2N5CHX...` |

The contract source was renamed from `niet_*` to `koul_*` after the initial deployments. The router was upgraded in place to the rule engine; its address stayed fixed. The policy was redeployed separately.

## Repository layout

```
Cargo.toml, rust-toolchain.toml   workspace, Rust 1.91.1 pinned
scripts/env.sh                    PATH and toolchain pins, source it before any build or deploy
contracts/
  koul_router/                    the rule engine: Autopilot, set_autopilot, tick, check, list_users, upgrade, set_oracle, tests
  koul_agent_policy/              the policy the agent key is bound to
  koul_mock_fx/                   Reflector-shaped mock oracle with set_price
  noop_policy/, deny_policy/      phase 0 probes, kept for the record
docs/
  phase0.md                       every gate T0 to T9 with tx hashes
  build-log.md                    router, keeper, anchor and web runs after phase 0
  abi/                            XOXNO controller and pool interfaces as fetched from testnet
  wireframe.html                  page designs (Home, Portfolio, Funds, Autopilots, Activity), open in a browser
keeper/
  src/keeper.ts                   the loop
  src/lib/common.ts               constants, env, state, kit factory, policy params, helpers
  src/anchor/                     Kumbara landing account port (MIT, see LICENSE-KUMBARA) plus local fee-bump relay
  src/phase0/passkey.ts           software P-256 WebAuthn authenticator for headless wallets
  scripts/setup-autopilot.ts      grant the agent and save Lira shield for the headless wallet
packages/core/                    typed autopilot schema, validation and contract codec; SDK reads and writes in progress
  scripts/demo-health.ts          passkey borrow to push the health factor under the minimum
  scripts/anchor-withdraw.ts      USDC from the smart wallet to TRY through a reverse landing account
  scripts/phase0/                 t1-t3, t3-deny, t4, t5, t6, t7, revoke
  .env.example                    variables the keeper needs
  .phase0-state.json              gitignored: wallet id, software passkey, rule ids, account id
web/
  app/                            Next.js 16 app router: page, oracle admin, api/oracle
  components/                     AgentAccess, Strategy, ActivityFeed, shadcn ui/
  lib/koul.ts                     addresses, policy params, unit helpers
  .env.example
```

## Running the stack locally

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Rust | 1.91.1 | installed by rustup from `rust-toolchain.toml`; add target `wasm32v1-none` |
| stellar CLI | 27.0.0 | prebuilt binary expected at `~/.local/bin/stellar-27/stellar`. The Homebrew CLI on the build machine is 26.1.0 and must not be used for builds. Adjust `scripts/env.sh` if your binary is elsewhere |
| Node | 20 or newer | |
| pnpm | 8 | `keeper/` and `web/` each have their own lockfile |
| Chrome or Safari with a platform authenticator | | only for the web app |

Every shell that builds or deploys starts with:

```sh
source scripts/env.sh
```

This puts the pinned CLI first on PATH, sets `RUSTUP_TOOLCHAIN=1.91.1` and `STELLAR_NETWORK=testnet`.

### 1. Contracts

```sh
source scripts/env.sh
stellar contract build            # all workspace members, output in target/wasm32v1-none/release/
cargo test -p koul_router         # pure decision helpers, 3 tests
```

Do not use a bare `cargo build --target wasm32v1-none`: the soroban-sdk build script requires the stellar CLI's spec shaking and fails outside `stellar contract build`.

Upgrading the live router in place, so the address and every user's rules survive:

```sh
source scripts/env.sh
stellar contract upload --wasm target/wasm32v1-none/release/koul_router.wasm --source niet-testnet --network testnet
# prints the new wasm hash, then
stellar contract invoke --id CBHRTWXARGZCUDBE7IX4SZV7GDFA6PRQICZQPUSOUPN3YDCVPXQBMT2P --source niet-testnet --network testnet -- upgrade --new_wasm_hash <hash>
```

`niet-testnet` is the stellar CLI identity holding the keeper secret (created before the rename; the name is local to this machine). Create yours with `stellar keys add niet-testnet --secret-key` and paste the same secret that goes into `KEEPER_SECRET` below.

Deploying fresh contracts follows the same pattern with `stellar contract deploy` and the constructor arguments listed in each contract's `__constructor`. The router takes `(admin, controller, pool, usdc, oracle, spoke_id)`, the policy takes nothing, the oracle takes `(admin)`.

### 2. Keeper

```sh
cd keeper
pnpm install
cp .env.example .env
```

Fill `.env`:

| Variable | Value |
|---|---|
| `STELLAR_NETWORK`, `NETWORK_PASSPHRASE`, `RPC_URL` | testnet defaults from the example |
| `ANCHOR_HOME_DOMAINS`, `ANCHOR_ASSET_CODE` | `tr-mock-anchor.fly.dev`, `USDC` |
| `KEEPER_SECRET` | a funded testnet G-secret. Pays fees, sponsors landing accounts, is the mock oracle admin and the router admin. Fund a new one with friendbot |
| `AGENT_SECRET` | the Ed25519 secret whose public key users grant. Any `stellar keys generate --as-secret` output. Its public key goes into the web app as `NEXT_PUBLIC_KOUL_AGENT_PUBLIC_KEY` |
| `ROUTER_V1` | `CBHRTWXARGZCUDBE7IX4SZV7GDFA6PRQICZQPUSOUPN3YDCVPXQBMT2P` |
| `KOUL_POLICY` | `CBDQPSGJDJUGLUIYTLAVH7C7FQE3ZN2HXOKYELNPEEUHFPV52QRI5AR2` |
| `MOCK_FX` | `CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2` |
| `ROUTER`, `NOOP_POLICY`, `DENY_POLICY` | phase 0 probe addresses, only needed by `scripts/phase0/*` |

The keeper and the setup scripts operate on the headless wallet described by `keeper/.phase0-state.json`. That file is gitignored because it contains the software passkey's private key. To create your own headless wallet from scratch:

```sh
pnpm phase0:t1-t3     # deploys a smart account with a software passkey, funds it, adds a noop agent rule, sends 1 XLM with the agent key
pnpm phase0:t4        # TRY -> USDC through the anchor sandbox into the wallet, then a passkey supply to XOXNO hub 1; records the XOXNO account id
pnpm setup-autopilot  # passkey: grant the agent under koul_agent_policy (pinned to the XOXNO account), remove stale rules, router.set_autopilot(wallet, 1, Lira shield)
```

`t1-t3` and `t4` write to `.phase0-state.json`. `setup-autopilot` needs `contractId`, `passkey` and `t4.accountId` in that file. The Lira shield autopilot is defined at the bottom of `scripts/setup-autopilot.ts`: five rules, health factor under 1.25 repays from the wallet, a 100 bps deposit-rate gap moves supply either way, USD per TRY under 0.0200 (USD/TRY over 50) withdraws each hub to the wallet, 900 s price staleness limit, cooldowns of 30 or 300 ledgers.

Other passkey helpers for the headless wallet:

```sh
pnpm position show                 # health factor, idle USDC, per-hub collateral, debt, rate, cash, utilisation
pnpm position supply 1 10          # also borrow, repay, withdraw <hub> <usdc>; borrow pushes the health factor down for the health-guard demo
pnpm policy-deny                   # agent-signed direct controller calls the policy must reject (7109, 7108, 7103) plus one allowed control
pnpm tx-diag <hash>                # failing diagnostic events of a testnet transaction
```

Run the keeper:

```sh
pnpm keeper:once                       # one pass over every user and autopilot the router lists: simulate tick, submit if it returns an action
pnpm keeper -- --interval 30           # loop every 30 s, also republishes the mock TRY price when older than 10 min
```

The keeper keeps no per-user state: users come from `router.list_users()`, autopilots from `list_ids(user)`, the agent rule id from the wallet's context rules. Each pass prints the simulated action, or when nothing applies the `check` view (`r1 HOLDS[+8080]` means rule 1's conditions hold with an observed rate gap of 8080 bps; `cooling` means the cooldown is running). On submission it prints the transaction hash.

Tests and typecheck:

```sh
pnpm test          # vitest, runs the ported landing account tests (9 cases)
pnpm typecheck
```

The typed SDK is being built in `packages/core`. Its `Autopilot` JSON uses decimal strings for u64/i128 values to avoid JavaScript precision loss. `autopilotSchema`, `validateAutopilot`, `encodeAutopilot`, and `decodeAutopilot` are available now. From `packages/core`, run `pnpm install`, `pnpm test`, and `pnpm typecheck`. Contract reads and unsigned transaction builders are the next step; see PLAN.md section D.

### 3. Web app

```sh
cd web
pnpm install
cp .env.example .env.local
pnpm dev                 # http://localhost:3000
```

`ORACLE_ADMIN_SECRET` in `.env.local` is the keeper secret; it is only read by the server route `app/api/oracle/route.ts` and never shipped to the browser. The `NEXT_PUBLIC_KOUL_*` overrides are optional and default to the live deployment.

The app uses Sembol's testnet preset and the public SDF relayer, so wallet creation and every passkey-signed call are fee-sponsored and no local secret is needed for user actions. Passkeys are bound to the origin, so a wallet created on `localhost:3000` is only reachable from `localhost:3000`.

The prototype's Strategy and Activity panels still speak the v1 router (`set_rules`, `branch`) and the v1 policy params; they are rewired to `@koul/core` in PLAN.md section D. Until then use the keeper scripts above for the rule engine.

Flow in the current prototype:

1. Create wallet (Face ID or Touch ID) or Connect wallet.
2. Fund XLM with friendbot from the wallet row. USDC has to come from the anchor flow or a transfer from a funded account.
3. Agent access: pick a duration and Grant. One passkey confirmation adds the agent rule with the policy.
4. Strategy: enter the XOXNO account id (from the first supply) and thresholds, Save rules. One passkey confirmation.
5. Activity lists every branch the router executed for this wallet, from its `Fired` events.
6. `/oracle`: current USD/TRY, age, Set price, presets 48.79 calm, 50.25 lira shock, Publish stale.

The keeper loop must be running for anything to execute. The web app never signs with the agent key.

### 4. Anchor scripts

```sh
cd keeper
pnpm anchor:withdraw 2       # 2 USDC from the headless smart wallet to TRY, prints every SEP step and the FAST reference
```

Deposit for the headless wallet is inside `pnpm phase0:t4`. The anchor was intermittently down during the night of 19 to 20 September; both directions have completed since.

## Demo scenarios

The Lira shield autopilot on the headless wallet, each proven on the rule engine (hashes in `docs/build-log.md`, "Keeper v2"):

| Scenario | How to trigger | What the router does |
|---|---|---|
| Rebalance | hub 2 pays more than hub 1 by over 100 bps (the borrower on account 23 keeps it so) and hub 1 holds collateral: `pnpm position supply 1 10` | rule 1 `MoveSupply(1 -> 2, All)`: withdraw from hub 1 and supply to hub 2 in one transaction, amount capped by hub cash and the 95 percent utilisation ceiling |
| Health guard | `pnpm position borrow 1 22` with the passkey, health factor drops under 1.25 | rule 0 `RepayFromWallet(1, All)`: repays `debt + 1 grain` from idle wallet USDC, health factor back to infinity |
| FX exit | on `/oracle` press 50.25 lira shock, or `set_price` on the mock oracle, then a keeper pass | rules 3 and 4 `WithdrawToWallet(hub, All)`: the first hub with something liquid is withdrawn to the wallet, the next tick after the cooldown takes the other hub; an empty hub is skipped |
| Stale price | `/oracle` Publish stale | `FxPrice` is false for a price older than its limit; `check` shows the observed price with `holds = false` |
| Nothing to do | any pass in between | `tick -> None`, the keeper prints the `check` view and spends no fee |
| Revoke | web app Revoke, or `pnpm phase0:revoke` | the next agent tick fails at simulation with `ContextRuleNotFound`, no fee spent |

A rule whose conditions hold but whose action has nothing to move (empty hub, no debt, empty wallet, illiquid hub) is skipped and the next rule is tried, so the order of the rules is the priority.

## Findings and constraints

These shaped the code and will shape the rule engine.

- **One `context_rule_id` per authorization context.** The smart account's `__check_auth` receives the root call plus every sub-invocation. A router tick is three or four contexts, so the keeper passes the rule id that many times. Getting it wrong fails with `ContextRuleIdsLengthMismatch`.
- **Auth trees bake exact arguments, positions accrue interest every ledger.** A withdraw amount read at simulation is stale by execution. Every router amount is snapped to 0.01 USDC, moves under 1 USDC are skipped, and repayments round the debt up by one grain.
- **A hub only releases its liquid cash and never past its utilisation ceiling.** XOXNO errors 112 and 127. `withdrawable()` caps by both, reading `max_utilization` from `get_sync_data`.
- **The policy rate limit counts contexts, not ticks.** A window of 40 allows roughly 10 ticks.
- **No TRY on any Reflector testnet feed** (FX, CEX or DEX). Hence the mock oracle. Interface is identical, so mainnet is one `set_oracle` call.
- **Testnet hubs had 0 percent supply rates.** Nobody borrowed USDC. The borrower identity fixes that and makes the rate gap steerable.
- **No protocol-native scheduler on Soroban.** SoroCron exists but its executor contract is the invoker, so it cannot carry a user's smart account authorization. The keeper is required.
- **The anchor rejects contract addresses** and its watcher ignores Soroban transfers. The landing account is an ownerless classic G-account with pre-authorized forward and cleanup transactions, sponsored by the keeper, alive for under a minute per transfer.
- **The agent cannot pay a landing account.** The policy allows USDC transfers to the pool only and landing accounts are created per transfer, so cashing out to TRY still takes one passkey confirmation for the transfer step.
- **SAC contracts have no wasm**, so calls to the USDC token are built with `contract.AssembledTransaction.build` rather than `contract.Client.from`.
- **The kit hides simulation diagnostics.** The keeper wraps `kit.rpc.simulateTransaction` to surface `Error(Contract, #N)`.

## Phase 0 gates

The project brief defined go/no-go gates. All passed. Details and hashes are in `docs/phase0.md`.

| Gate | Result |
|---|---|
| T0 toolchain and provenance | smart account wasm reproduced byte for byte from OpenZeppelin `1e513890` |
| T1 smart account | headless wallet deployed |
| T2 custom policy install | noop policy installed under a Default rule |
| T3 agent-only call, positive and deny | agent key signs alone, deny policy rejects at simulation |
| T4 anchor USDC into the wallet and XOXNO supply | account 12 |
| T5 agent-signed cross-hub withdraw and supply | two transactions |
| T6 the same through the router, atomic | one transaction, four contexts |
| T7 real policy: allowlist, recipient, expiry, rate limit | all four negatives rejected at simulation |
| Revoke | one passkey call, agent cut off immediately |
| T8 oracle and rates | two findings, both handled |
| T9 anchor with a contract wallet | solved with the landing account port |

T3 and T5 green meant custody stays in the user's smart account with a session key, no vault.

## Open items

- Router becomes a rule engine (ordered rules per autopilot, conditions with all or any, one action, cooldown), keyed by user and autopilot id, with keeper changes. Decided in principle, not started.
- Designed web app on shadcn, replacing the prototype in `web/`. Design is in review.
- Oracle admin moves to its own app.
- Sentence to rules route backed by Claude.
- Cash out to TRY as an autopilot action needs the landing account decision above.
- The Sembol pull request is open and unreleased; the web app inlines the same logic until then.
