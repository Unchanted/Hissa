# User-owned data marketplace

Implementation planning and completed Arkiv validation for ETHGlobal Mumbai.

- [Current architecture and product scope](docs/architecture.md)
- [Approved plan (partly superseded by architecture)](docs/plan-v2.md)
- [Data sources and the third-party message rule](docs/data-sources.md)
- [Arkiv SDK and security research](docs/arkiv-research-2026-11-06.md)
- [Live test findings, transaction links and remaining checks](docs/arkiv-test-findings-2026-11-06.md)

The encrypted-storage and listing-lifecycle probes passed and their temporary
code/dependencies were removed. Public results remain in `evidence/`. There is
no runnable application or npm test command yet.

The funded Rabdi writer key remains in the ignored local `.env`; the synthetic
record/key journal remains in ignored `evidence/private/`. Keep both private.
`.env.example` lists configuration names without secrets.

AI assistance was used for research, probe implementation and validation.
