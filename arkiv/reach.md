# Reach

## Who is it for, and would they use it?
- **Sellers:** Indian AI-chat users (ChatGPT, Claude, WhatsApp exports) who would sell their own signal, with consent they control and can revoke.
- **Buyers:** D2C brands and AI teams who need consented human data and anonymised insight (k >= 50) instead of scraping.
- **Honest status:** hackathon demo. We have **no real users yet** and claim no numbers. On Arkiv Rabdi today (run the [query](how-you-use-arkiv.md)): 2 live listings (`lst_eebc6757`, `lst_42f7f21d`) and 5 receipts (2 listing, 3 insight purchases), all written by us from our own or sample exports.
- **Would they use the Arkiv part?** They already do without knowing it. Sellers never need a wallet: they sign with a browser-held key and the service pays gas. Publish, consent, revoke, earnings, buyer discovery, insight cohorts and the Public Ledger all read Arkiv ([how-you-use-arkiv.md](how-you-use-arkiv.md)).

## Can they try it today, and will you keep building it after Mumbai?
**Try it now:** https://hissa.tech (live API https://api.hissa.tech, Arkiv Rabdi testnet, Hedera testnet).
1. Open the app, go to Seller, click **sample export** (or upload a ChatGPT/Claude JSON).
2. Review the masked text, set consent and expiry, publish. You get an Arkiv tx hash.
3. Open Buyer/Agent and ask for the listing's domain; the agent finds it via Arkiv and buys it with testnet HBAR.
4. Check the Public Ledger, toggle consent or revoke in Seller.

**After Mumbai (plan, not a promise):**
1. Pilot with a few real chat-export owners and 2 to 3 D2C brands reachable through the team.
2. Per-seller wallets or account abstraction so users own their entities, not the service wallet.
3. Renewal job for the ~182-day expiry; multi-writer design instead of one always-on machine.
4. Mainnet Hedera payments and real payouts.

We will continue if a pilot brand will pay for one insight report.
