# Koul, project summary

Paste-ready text for the submission form. Live app https://koul-stellar.vercel.app, repo
https://github.com/atahanyild/koul, Stellar testnet.

## One line

Koul turns "if this, then that" into contract state on Stellar, so a strategy runs by itself without anyone taking
custody of your money.

## Short, about sixty words

Koul is a conditional execution engine on Stellar. You say what should happen to your position and when; Koul stores
it as rules inside a contract. A keeper pokes that contract, the contract itself re-reads the world, decides, and
acts in the same transaction. Funds stay in your own passkey smart account, and a policy contract limits the agent
key to exactly what your rules need. XOXNO lending is the first integration.

## Full, about two hundred and fifty words

Someone in Turkey holding lira has two ways to protect savings today: watch a screen all day, or hand the keys to a
bot. Koul removes that choice. You write a sentence, Koul turns it into an ordered list of rules, and those rules
become state inside a Soroban contract. A keeper pokes the contract on a schedule and carries no logic of its own:
it simulates, and submits only when the contract says an action applies. The contract re-reads pool rates, your
health factor and an oracle price, decides which rule is true, and executes it in the same transaction.

Three properties make this different from a trading bot. The rules are on-chain and readable, so anyone can see what
your autopilot will do. The decision is on-chain, so a broken or malicious keeper cannot invent an action. And the
key is scoped by a contract: the agent lives on your own OpenZeppelin smart account under a policy that allowlists
the exact calls, pins your own lending account, forces withdrawals back to your wallet, rate limits and expires. You
keep the passkey; the agent gets a leash. Revoking it takes one tap.

The first integration is XOXNO lending, with lira moving in and out through a TR anchor using SEP-6, SEP-10, SEP-12
and SEP-38 and an ownerless landing account per transfer. The engine itself is protocol-agnostic: swaps and
perpetual DEXs are next, and after that an MCP server so people manage autopilots by talking to their own assistant,
which proposes rules and never holds funds or keys.
