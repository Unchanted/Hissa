# Arkiv foundation

Private ESM TypeScript package for the marketplace's Arkiv schemas, read-side `ArkivReader`, and single-process writer queue. It exports source TypeScript directly and uses Node 24's native TypeScript stripping in tests.

```sh
cd packages/arkiv
npm install
npm run typecheck
npm test
```

`SerialQueue` only orders tasks inside one process and one shared queue instance. The caller must await the Arkiv transaction receipt inside each queued task; queuing only the submission would not serialize receipt completion or nonce use. There is no `ArkivStore`, wallet integration, write flow or HTTP route yet.

`createArkivReader({ accessKey, writer })` creates the Rabdi public client. The reader scopes reads to that configured creator and current owner, checks entity flags, returns at most 100 rows per keyset page, and omits listing blobs from browse previews. Its local exported types are provisional until `packages/shared` defines the shared contract. The package has no write methods or HTTP routes.
