# Phase-0 log

Go/no-go gates from the project brief, section 7. Every tx hash and address goes here.

## Environment (pinned)

| Item | Value | Where |
|---|---|---|
| Rust | 1.91.1 (rustup toolchain, `rust-toolchain.toml`) | repo root |
| soroban-sdk | 26.1.0 | `Cargo.toml` workspace dep |
| stellar-accounts | OpenZeppelin/stellar-contracts @ `1e513890ecf79833c9d6e7ef38a9358001c0b111` (git dep, resolves to crate v0.7.1) | `Cargo.toml` |
| stellar CLI | 27.0.0 prebuilt, `~/.local/bin/stellar-27/stellar` (`source scripts/env.sh`) | Homebrew CLI is 26.1.0, do not use for builds |
| CLI identity | `niet-testnet` = `GAFHZTSL63YZYU35SCHDOGOMXQ25266DBQYG7KETG6HC2AHBIZMGXP6U` (funded, ~9975 XLM) | `stellar keys` |
| smart-account-kit | 0.6.2 on npm (latest 0.8.0). Deps: `@stellar/stellar-sdk >=16.0.0`, `smart-account-kit-bindings 0.4.0`; peer `@creit-tech/stellar-wallets-kit >=2.1.0` | verified 2026-09-19 |
| @sembol/passkey-react | 0.4.0 on npm. Deps: `smart-account-kit ^0.6.0`, `@stellar/stellar-sdk ^16.0.1` | verified 2026-09-19 |
| @stellar/stellar-sdk | pin 16.0.1 (latest 17.1.0) | |

## T0 - Toolchain + provenance: PASS (2026-09-19)

Built `multisig-account-example` from the pinned commit with Rust 1.91.1, `wasm32v1-none`,
`stellar contract build --locked --optimize=true`.

| Check | Hash |
|---|---|
| Local build (`stellar contract info hash`) | `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |
| Local build (`shasum -a 256`) | `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |
| Fetched from testnet (`stellar contract fetch --wasm-hash 1b5f...`) | `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |

Byte-for-byte identical (41855 bytes). Any policy we build from the same commit and toolchain is
ABI-compatible with the canonical smart-account wasm that smart-account-kit 0.6.2 / Sembol deploy.

The `Policy` trait at `1e513890` (`packages/accounts/src/policies/mod.rs:47`) matches the brief exactly:
`type AccountParams: FromVal<Env, Val>`, `enforce(e, context, authenticated_signers, context_rule, smart_account)`,
`install(e, install_params, context_rule, smart_account)`, `uninstall(e, context_rule, smart_account)`.
`ContextRuleType` is `Default | CallContract(Address) | CreateContract(BytesN<32>)`.

## T1 - Smart account: PASS (headless, 2026-09-19)

Run with `keeper/scripts/phase0/t1-t3.ts` (software P-256 passkey ported from Kumbara, keeper G-account as
`deployerSecret`, `forceMethod: "rpc"`, no relay). The user's real Face ID wallet through Sembol is a separate,
later step; the headless wallet is enough to validate the auth stack.

| Item | Value |
|---|---|
| Smart account | `CBHMG4IGCLP36WJUMYR55N2TGDSZ4C5V6YQSBT4HWT6A77DCL3Y7UUFL` |
| Deploy tx | `06a6a89fc8ae999b35433160b13a6065d58bcf53c24021a42855a987f15216e2` |
| Fund tx (`kit.fundWallet`, friendbot -> temp G -> SAC transfer) | `52e47a145517ca493834c4dbb9f969b9771b7f92ab549b334a2c469637dd18c0` |
| Default rule | id 0, name `multisig`, `Default` context, one `External(webauthn_verifier, credential)` signer, no policies |
| Agent Ed25519 | `GBVD753EJMRQYI6WQCWC4OMDCNMGQMHXRT7IOAHTT3FD7ON6OQXTSAK3` (raw pubkey `6a3ff764...742f39`) |

## T2 - Custom policy install: PASS (2026-09-19)

`contracts/noop_policy` built against `1e513890`. `AccountParams = ()`, so install with `xdr.ScVal.scvVoid()`.
`enforce` = `smart_account.require_auth()` + small `NoopEnforced` event
`(smart_account topic, context_rule_id, contract, fn_name, signers)`. Never rejects.

| Item | Value |
|---|---|
| Wasm hash | `7c0a3232239f193f2d2c1ff6be3f4bf8bb75b299430f6684fd199336a70c7194` (7416 bytes) |
| Contract | `CA4TJH2WKPTYYL4W3LUBJ7BCVPQLYZFQJTVRO4KIPYQHY5OWU4M3HOGX` |
| Deploy tx | `bb8fcedb7adb09e885ed07f56695b1f75658530420e360f6261d2923c9fd4270` |
| CLI alias | `noop_policy` (`.stellar/contract-ids/`) |

`kit.rules.add(createDefaultContext(), "niet-agent", [createEd25519Signer(ED25519_VERIFIER, agentPub32)],
new Map([[NOOP_POLICY, xdr.ScVal.scvVoid()]]), ledger + 17280)` + `kit.signAndSubmit(tx, { forceMethod: "rpc" })`.

| Item | Value |
|---|---|
| rules.add tx | `a5eb4db3eb67c442e7da274855f47886f0484dbb31f98de9a0b82fb9dba2e27c` |
| Rule | id **1**, name `niet-agent`, `Default`, signer `External(CAAVTMCB..., agent pubkey)`, policies `[CA4TJH2W...]` |

Custom policy with `AccountParams = ()` installs with `scvVoid` as expected. The kit's `policies: Map<string, unknown>`
passes an `xdr.ScVal` straight through for unknown policy addresses.

## T3 - Agent-signed simple call: PASS, positive and negative (2026-09-19)

Agent key only (the passkey authenticator is replaced by one that throws if consulted), 1 XLM from the smart account to
the keeper G-address through the XLM SAC, `kit.multiSigners.transfer(..., { resolveContextRuleIds: () => [1] })`.
Keeper G-account is the tx source and pays the fee.

| Case | Result | Tx |
|---|---|---|
| Pinned to rule 1 (`niet-agent`, noop policy) | **SUCCESS**, 1 auth context, `NoopEnforced` event emitted | `f2df3a82ea16959142549302cc24df1b77be9cd42c0dd99effa989d28ccf9902` |
| Pinned to rule 2 (`niet-agent-deny`, deny policy `CB2N5CHX...`, rule add tx `a34ebdbe...`) | **FAILS at simulation** (`SimulationError` 5001, no fee spent) | none |
| Control, pinned to rule 1 again | SUCCESS | `58e3fe455c2e196143cd4e2fed550c9f471746aae474fd5fd0f71a422d520b6e` |

Event decoded: topics `noop_enforced`, smart account; data `context_rule_id: 1, contract: XLM SAC, fn_name: transfer,
signers: 1`. So the external-signer + custom-policy path works end to end and the policy is what decides.
Script: `keeper/scripts/phase0/t3-deny.ts`. Deny policy: `contracts/deny_policy`.

**Go/no-go so far: T3 green.** T5 decides Plan B.
## T4 - Testnet USDC + XOXNO supply: PASS (2026-09-19, `keeper/scripts/phase0/t4.ts`)

USDC came through the TR Mock Anchor's SEP-6 sandbox path to the keeper G-account (no landing account needed for a
G-account we own), then a SAC transfer into the smart account, then a passkey-signed `controller.supply`.
The anchor's USDC SAC equals XOXNO's USDC SAC, verified in code (no two-USDC seam).

| Step | Value |
|---|---|
| Keeper USDC trustline | `fa2a41dde9727777b7e49af341c267a93f36a34914272abd8a6622d34d4ab2d4` |
| SEP-10 / SEP-12 (ACCEPTED, no fields) / SEP-38 firm quote | `qt_adl1s2ud15hg1dcwwh8h`: 2500.00 TRY -> 50.9902271 USDC @ 48.785078 |
| SEP-6 deposit-exchange | `sep_xmxc53sm9bcbfa6lwzjd`, IBAN `TR05 0009 9000 0000 0000 0000 01`, reference `TRMA-YCQF-BR9S` |
| Sandbox `simulate-bank-transfer` -> completed | ~9 s, anchor paid exactly the quoted amount |
| Anchor classic payment | `1cd46066c27d663ca36abcd24106310aac43c93862dfe4a74523e8399d2ad5a8` |
| SAC forward keeper -> smart account (50.9902271 USDC) | `b60de952cd18ba62569d34b2e5d9a2c071c89cc4d515ce44fe3f0383b86d91c6` |
| `controller.supply(wallet, 0, 3, [(hub1 USDC, 50.9902271)])`, passkey, keeper source | `26ddc4976e763e0478a7257522e643932da75f9e949057eba09c78d7e7d29784` |
| XOXNO `account_id` | **12** |

Auth shape for supply: **1** auth entry, address = smart account, root `supply`, 1 sub-invocation (the USDC
`transfer` wallet -> pool). So a single smart-account signature covers the controller call and the token pull.

Position reads after supply: `get_account_attributes` = `{mode: 0, spoke_id: 3}`; hub1 USDC position
`scaled_amount` 5.099e28 (RAY-scaled), `loan_to_value` 7500 bps, `liquidation_threshold` 8000 bps;
`get_total_collateral_usd` = 50990497646420738048 (**WAD, 1e18**, = 50.99 USD); `get_health_factor` = `i128::MAX`
when there is no debt (treat as infinity in the router).
## T5 - Agent-signed XOXNO withdraw + supply across hubs: PASS (2026-09-19, `keeper/scripts/phase0/t5.ts`)

Agent key only (passkey authenticator throws if consulted), keeper G-account as source and fee payer,
`kit.multiSigners.operation(assembledTx, [ed25519], { resolveContextRuleIds })`. Two transactions, because Soroban
allows one `InvokeHostFunction` per transaction; T6 makes the pair atomic through the router.

| Call | Auth entry shape | Contexts | Tx |
|---|---|---|---|
| `controller.withdraw(wallet, 12, [(hub1 USDC, 20)], Some(wallet))` | `[wallet] controller.withdraw` | 1 | `5f079ebea24088ee4d00a1f31abcc55d071318d85e5542d90cc11463b05807bc` |
| `controller.supply(wallet, 12, 3, [(hub2 USDC, 20)])` | `[wallet] controller.supply > usdc.transfer(wallet -> pool)` | **2** | `5fe8256428cb20165861c1c8c6944725c20016f1695da4d1b005ce260d9496f7` |

Positions: before `{hub1: 50.9902271}`, after `{hub1: 30.9902271, hub2: 20.0000000}`. **Core redistribution is feasible.**

**Lesson (first supply attempt failed with `ContextRuleIdsLengthMismatch` #3014):** the smart account's `__check_auth`
receives one context per invocation in the auth entry's tree, root plus every sub-invocation, and `context_rule_ids`
must have exactly that length. The kit's `resolveContextRuleIds(entry, index)` must therefore return
`Array(1 + subInvocations).fill(ruleId)`, not `[ruleId]`. The keeper's helper is `countContexts()` in `t5.ts`.
The diagnostic event shows exactly what the policy will see: `[[Contract, {contract: controller, fn_name: supply,
args: [...]}], [Contract, {contract: usdc, fn_name: transfer, args: [wallet, pool, amount]}]]`, which is what
`niet_agent_policy` allowlists and, for `transfer`, checks `args[1] == pool`.

**Go/no-go: T3 and T5 green -> Plan B (session-key design) confirmed.**
## T6 - Nested via router: PASS (2026-09-20, `keeper/scripts/phase0/t6.ts`)

`contracts/niet_router` probe: `tick_force(user, account_id, from_hub, to_hub, spoke_id, amount)` does
`user.require_auth()`, then `controller.withdraw(user, id, [(from, amount)], Some(user))` and
`controller.supply(user, id, spoke, [(to, received)])`, emits `Fired`.

| Item | Value |
|---|---|
| Router | `CA53BZYXAIUHPFLG5R6PUFOEQBXLEJJ465XHP6NOLRBB4XXXF6VMFLJ3` (wasm `22e58de9...`, constructor: controller, usdc) |
| Agent-signed `tick_force(wallet, 12, 2 -> 1, 3, 5 USDC)` | `565ce4fdcf8df9ef0081190f1c0e5c083a74471fc55931031b6778413dcee78a` |
| Auth entry | **1** entry, `[wallet] router.tick_force > controller.withdraw > controller.supply > usdc.transfer`, **4 contexts**, `context_rule_ids = [1,1,1,1]` |
| Positions | before `{hub1: 30.99, hub2: 20.00}`, after `{hub1: 35.99, hub2: 15.00}`; returned 50000000 |

The nested `caller.require_auth()` calls inside the controller are satisfied through the router's auth tree with a
single agent signature. **Redistribution is atomic in one transaction; the router owns the decision.** The policy
will see all four contexts, so the allowlist must include `(router, tick)`, `(controller, withdraw)`,
`(controller, supply)`, `(usdc, transfer -> pool)`.

Note: the anchor became unreliable during the night of 19/20 Sep (user report). T4's deposit already completed, so
T5-T7 do not touch it. Withdraw/FX-exit legs through the anchor stay as a later or recorded step.
## T7 - Real `niet_agent_policy`, positive + negatives: PASS (2026-09-20, `keeper/scripts/phase0/t7.ts`)

`contracts/niet_agent_policy` (wasm `bff1d465f05f694aaa416d06b616f1b31522566a85b30c7c7bf702919829d237`, 11.8 KB) deployed at
**`CCEYSMIWTRJL7GE6G4MVKEC4NONUCTYVMZKMQH7D3PTQ7DPBLU5V3X4O`**. Install params (`NietAgentParams`, passed as a
hand-built `ScVal` map): `allowed_calls = [(router, tick_force), (controller, withdraw), (controller, supply),
(usdc, transfer)]`, `allowed_transfer_recipients = [pool]`, `max_calls_per_window = 5`, `window_ledgers = 2000`.
`enforce` runs once per auth context (a 4-context tick counts 4), rejects non-`Contract` contexts, then allowlist,
then recipient for `transfer` (`args.len() == 3`, `args[1]`), then the rolling window counter; emits `NietEnforced`
(account topic, rule id, contract, fn_name, calls_in_window). Errors 7100-7107.

| Rule | id | Tx |
|---|---|---|
| `niet-agent-v1` (agent signer + niet policy, 1 day) | 3 | `d11fda88b9f686bf90f69d56764f86efd7d4308f33147d0cb0d71ac15e8613f7` |
| `niet-agent-expiring` (same, `valid_until` = ledger + 4) | 4 | `a74f3b20e914abff1b4353499d0f782a82f06f58abca22c241f640bbc8126530` |

| Case | Pinned rule | Result | Evidence |
|---|---|---|---|
| Positive: `tick_force(hub1 -> hub2, 3 USDC)`, 4 contexts | 3 | **SUCCESS** | `073f9d76fcb17de26a755cae3cfd0fdef0f9b84825f289b1100db5faadbdf62d`; policy window after: `{calls: 4, window_start: 4766288}` |
| (a) `usdc.transfer(wallet -> keeper G, 1 USDC)` | 3 | **REJECTED** at simulation | `Error(Contract, #7104)` TransferRecipientNotAllowed |
| (b) `xlm.transfer(wallet -> pool, 1 XLM)` (contract not allowlisted) | 3 | **REJECTED** | `Error(Contract, #7103)` CallNotAllowed |
| (c) `tick_force` after `valid_until` | 4 | **REJECTED** by the smart account itself | `Error(Contract, #3002)` UnvalidatedContext, before any policy call |
| (d) second tick in the window (4 + 4 > 5) | 3 | **REJECTED** | `Error(Contract, #7106)` RateLimited |
| (e) `CreateContract` context | - | not exercised | rejected by code (`NotContractContext` 7102); building such an auth from the kit is out of scope |

All rejections happen at simulation, so a misbehaving keeper never pays a fee and nothing lands on-chain. The
diagnostics were captured by wrapping `kit.rpc.simulateTransaction`; the kit's own `SimulationError` hides them.
Note for the real router: the rate limit counts contexts, so size `max_calls_per_window` as `ticks * 4`.
Case (a) needed idle USDC in the wallet: 1 USDC was withdrawn under the noop rule first
(`006d1a3eb681d47099ad976e4ef66aadebd9cae932bd297ae8704c1d4b4a361b`).
## T8 - Oracle + rate reads: DONE, with two findings (2026-09-19)

### Reflector FX testnet `CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W`

| Call | Result |
|---|---|
| `base()` | `{"Other":"USD"}` |
| `decimals()` | 14 |
| `resolution()` | 300 s |
| `assets()` | EUR, GBP, CHF, CAD, MXN, ARS, BRL, THB, XAU |
| `lastprice({"Other":"TRY"})` | **null** |
| `lastprice({"Other":"USD"})` | null (base asset) |
| `lastprice({"Other":"EUR"})` | `{"price":"114770881626529","timestamp":1789846200}` = 1.14770881626529 USD per EUR |
| `lastprice({"Other":"BRL"})` | `{"price":"19470921045924","timestamp":1789846200}` = 0.1947 USD per BRL |
| `last_timestamp()` | 1789846200 (73 s old at read time; fresh) |

**Finding 1: TRY is not listed on the Reflector FX testnet feed.** The FX-exit stretch branch cannot read USD/TRY
on-chain from this oracle. Options, decision needed:

- (a) Demo the FX branch on a listed pair the jury understands (EUR is listed and XOXNO lists EURC).
- (b) Keep USD/TRY but source it from the anchor's SEP-38 price in the keeper (off-chain), and make the router take
  the rate as a signed keeper input. This weakens "decisions on-chain" for that one branch; say so on the slide.
- (c) Ask Reflector at the event whether TRY can be added to the testnet FX feed.

Units for the router: price is quote-per-1-asset in USD with 14 decimals, `resolution` 300 s. Staleness guard:
reject if `now - timestamp > 2 * resolution`.

### XOXNO pool `CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A`, asset USDC `CBIELTK6...`

`HubAssetKey { asset: Address, hub_id: u32 }`. Rates are annual, **RAY (1e27 = 100%)**, confirmed from
`get_sync_data(hub1)`: `base_borrow_rate` 1e25 (1%), `max_borrow_rate` 2e27 (200%), `optimal_utilization` 0.89e27,
`reserve_factor` 1000 (bps, 10%), `asset_decimals` 7. Supplied/borrowed amounts in `get_sync_data.state` are RAY-scaled
too (`supplied` 2.0957e30 = 20,956.918294 USDC), while `get_supplied_amount` returns plain 7-decimal units.

| Hub | `get_deposit_rate` | `get_borrow_rate` | `get_utilisation` | `get_supplied_amount` | `get_borrowed_amount` |
|---|---|---|---|---|---|
| 1 (USDC) | 0 | 1e25 (1%) | 0 | 20,956.918294 USDC | 0 |
| 2 (USDC_HUB2) | 0 | 1e25 (1%) | 0 | 0 | 0 |

**Finding 2: both hubs currently have a 0% deposit rate because nobody borrows USDC on testnet.** The
redistribution branch (`rate(hub_b) - rate(hub_a) > threshold_bps`) will never fire on the live pool as it stands.
For the demo we must create utilisation ourselves: supply collateral (XLM or BTC) on spoke 3 from a second account and
borrow USDC from hub 2, which pushes hub 2's deposit rate above 0 while hub 1 stays at 0. Budget this into T4/T5 setup.
Threshold units in the router: compare RAY rates, `threshold_bps * 1e23`.

ABIs saved: `docs/abi/xoxno_controller.rs`, `docs/abi/xoxno_pool.rs` (from `stellar contract info interface`).
Controller also exposes `get_health_factor(account_id) -> i128` (units to confirm in T4 once a position exists),
`get_total_borrow_usd`, `get_total_collateral_usd`, `get_ltv_collateral_usd`, `is_liquidatable`.
## T9 - Anchor with a contract wallet: SOLVED by porting Kumbara's landing account (2026-09-19)

Kumbara (`github.com/keyboord01/kumbara` @ `b249725`, MIT, Sembol) already answered both questions against this exact
anchor, on testnet, with recorded tx hashes (`docs/anchor-notes.md` sections 1-8):

- The anchor rejects C-address destinations explicitly (`invalid_destination_address`), SEP-10 has no SEP-45, and the
  watcher ignores Soroban transfers (a SAC transfer to a muxed treasury lands on-chain but is never matched).
- Solution: an **ownerless landing account** per deposit/withdrawal. Sponsor creates it with sponsored reserves and a
  USDC trustline; inside a `beforeLock` hook it does SEP-10/12/38/6 while it still holds its key; two pre-authorized
  envelopes are built for the exact quoted amount (forward at seq+1, cleanup-merge at seq+2, plus an abort at seq+1
  for deposits); lock sets master weight 1 + two preauth signers weight 1, thresholds 2/2/2; the secret is wiped
  in-process. Ten deposits and one withdrawal recorded, amount match 10/10, ~0.0016 XLM and 40-50 s per deposit.

Ported verbatim into `keeper/src/anchor/`:

| File | Origin | Change |
|---|---|---|
| `landing.ts` | `lib/landing/landing.ts` | none |
| `secret-guard.ts` | `lib/landing/secret-guard.ts` | none |
| `landing.test.ts` | `lib/landing/landing.test.ts` | none; **9/9 pass** (`pnpm test`, needs `--expose-gc`) |
| `sep.ts` | `lib/sep.server.ts` | dropped `server-only`, import path |
| `discovery.ts` | `lib/anchor.server.ts` | dropped `server-only`, Next data cache and KV anchor switch; env vars `ANCHOR_HOME_DOMAINS`, `ANCHOR_ASSET_CODE`, `NETWORK_PASSPHRASE` |
| `LICENSE-KUMBARA` | `LICENSE` | attribution |

Still to wire for Niet: a `RelaySubmitter` (`sendXdr`) that fee-bumps with the keeper G-account instead of Kumbara's
OpenZeppelin Channels relay, and the `KEEPER_SECRET` doubling as the landing sponsor. For the FX-exit branch the keeper
takes the SEP-38 firm quote at trigger time, then builds the reverse landing account and the pre-auth payment with the
anchor's memo, exactly Kumbara's withdrawal pipeline (`lib/withdraw.server.ts`, not ported yet).

## Kit 0.6.2 facts that shape T1-T3 (verified from `node_modules/smart-account-kit/dist/*.d.ts`)

- `SmartAccountConfig.deployerSecret` exists: a local G-secret deploys wallets and pays fees over RPC, no relay needed
  (`forceMethod: "rpc"`). Kumbara's spikes also show a software P-256 authenticator (`keeper/src/phase0/passkey.ts`)
  drives the real WebAuthn verifier from Node. So T1-T3 can run headless with a throwaway wallet; the user's real
  Face ID wallet comes later through Sembol.
- `kit.rules.add(contextType, name, signers, policies: Map<addr, params>, validUntil?) -> AssembledTransaction`, then
  `kit.signAndSubmit(tx)` (passkey-only path). Custom policy params go in as an `xdr.ScVal`.
- `createDefaultContext()`, `createCallContractContext(addr)`, `createExternalSigner(verifier, keyData)`,
  `createEd25519Signer(verifier, pubkey32)` are exported from the kit.
- Ed25519 signing path: `kit.externalSigners.addEd25519FromSecret(secret)` then `kit.multiSigners.operation(tx,
  selected, { resolveContextRuleIds: (entry, i) => [ruleId] })`. `kit.transfer` / `kit.signAndSubmit` are passkey-only.
  `resolveContextRuleIds` is how we pin the `niet-agent` rule id per auth context (T3, T5).
- `kit.signAuthEntry(entry, { contextRuleIds })` is public for hand-built transactions (T5/T6 with a keeper G-source).
