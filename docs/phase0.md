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
## T8 - Oracle + rate reads: TODO
## T9 - Anchor with contract wallet: TODO
