# Evidence manifest

Every item states its source (live, local EVM, fixture or simulated), when it was produced and at which commit.
Nothing here is a production guarantee.

## Local EVM fixture (chain 31337)

| Role | Derivation | Notes |
| --- | --- | --- |
| Deployer | dev mnemonic index 0 | Publicly known Anvil/Hardhat test mnemonic. No value. Never use on a public network. |
| Wallet A (source) | index 1 | Holds 800 fUSDC after seed. |
| Wallet B (destination) | index 2 | Holds 0 fUSDC and native test gas; approves S for 1000 fUSDC. |
| Sink | index 3 | Receives drained tokens in the transfer-first branch. |
| Token | `MockUSDC` at deployer nonce 0 | "USDC fixture (no monetary value)", symbol fUSDC, 6 decimals. Not Circle-issued USDC. |
| Spender S | `TestSpender` at deployer nonce 1 | Deliberately exercisable by anyone. Says nothing about real spenders. |

Compiler: solc-js 0.8.28 (pinned), optimizer 200 runs, EVM cancun. Artifacts in `packages/chain/src/artifacts/`.

Reproduce (requires a local node on 127.0.0.1:8545 with chain ID 31337):

```bash
anvil
pnpm contracts:compile
pnpm chain:seed      # writes evidence/local-evm/seed.json
pnpm chain:proof     # writes evidence/local-evm/ordering-proof.json
```

| Item | Status |
| --- | --- |
| `evidence/local-evm/seed.json` | NOT YET RUN: Foundry not installed at scaffold time |
| `evidence/local-evm/ordering-proof.json` | NOT YET RUN |

## Unit tests

`pnpm test` runs exposure math (acceptance #2), sponsored selection sequence (#6), message contract rejection (#8), reporting allowlist and the offers-module import check (#7).

## Origin boundary (local, same-site localhost)

Checked in the in-app browser at the scaffold commit: publisher page at `http://localhost:5174` frames `http://localhost:5173/slot.html`; the frame validates INIT against the publisher registry and replies with READY only; publisher JavaScript reads `iframe.contentDocument` as `null`. The slot route sends `frame-ancestors http://localhost:5174`; the app and handoff routes send `frame-ancestors 'none'`.
Localhost ports are distinct origins but the same site, so this is not proof of cross-site browser behavior. Deployed cross-site hosts still need testing.

## Partner integrations

| Partner | Status |
| --- | --- |
| 0G inference | Router reachable (`GET /v1/models` returned a model list). No completion yet: no credential configured. |
| Arkiv (Rabdi) | RPC returned chain ID 0x76edaf (7794095). No write yet. |
