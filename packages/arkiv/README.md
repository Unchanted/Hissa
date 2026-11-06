# Arkiv foundation

Private ESM TypeScript package for the marketplace's four Arkiv schemas and the single-process writer queue. It exports source TypeScript directly and uses Node 24's native TypeScript stripping in tests.

```sh
cd packages/arkiv
npm install
npm run typecheck
npm test
```

`SerialQueue` only orders tasks inside one process and one shared queue instance. The caller must await the Arkiv transaction receipt inside each queued task; queuing only the submission would not serialize receipt completion or nonce use. This package does not yet implement an `ArkivStore`, wallet, RPC client or transaction flow.
