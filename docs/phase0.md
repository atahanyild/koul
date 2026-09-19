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

## T1 - Sembol wallet: TODO

Needs a passkey (Face ID) interaction, run by a human. Record the C-address and `kit.rules.list()` output here.

## T2 - Custom policy install: probe deployed, rule install TODO

`contracts/noop_policy` built against `1e513890`. `AccountParams = ()`, so install with `xdr.ScVal.scvVoid()`.
`enforce` = `smart_account.require_auth()` + small `NoopEnforced` event
`(smart_account topic, context_rule_id, contract, fn_name, signers)`. Never rejects.

| Item | Value |
|---|---|
| Wasm hash | `7c0a3232239f193f2d2c1ff6be3f4bf8bb75b299430f6684fd199336a70c7194` (7416 bytes) |
| Contract | `CA4TJH2WKPTYYL4W3LUBJ7BCVPQLYZFQJTVRO4KIPYQHY5OWU4M3HOGX` |
| Deploy tx | `bb8fcedb7adb09e885ed07f56695b1f75658530420e360f6261d2923c9fd4270` |
| CLI alias | `noop_policy` (`.stellar/contract-ids/`) |

Remaining: from a Node script with smart-account-kit 0.6.2, `kit.rules.add(createDefaultContext(), "niet-agent",
[createExternalSigner(ED25519_VERIFIER, agentPubKey32)], new Map([[NOOP_POLICY, xdr.ScVal.scvVoid()]]), ledger + 17280)`,
sign with the passkey, confirm via `kit.rules.list()`.

## T3 - Agent-signed simple call: TODO
## T4 - Testnet USDC + XOXNO supply: TODO
## T5 - Agent-signed multi-context XOXNO call: TODO
## T6 - Nested via router: TODO
## T7 - Policy negatives: TODO
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
