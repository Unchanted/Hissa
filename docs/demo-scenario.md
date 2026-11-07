# Demo scenario: Om's skincare chat

Fictional, synthetic chat. The only real-world element is the name Om Dwivedi, who consents. File: `demo/om-skincare-chatgpt.json`.

## Story

**Om Dwivedi**, 22, final-year student in Andheri, Mumbai. Over about two weeks he asks ChatGPT how to handle oily, acne-prone skin in monsoon humidity on roughly ₹500 a month. He compares Minimalist, Dot & Key, Deconstruct and The Derma Co, adds a Minimalist sunscreen and serum to a Nykaa cart (₹998 + ₹60 shipping) and abandons it, drops a ₹445 Dot & Key vitamin C serum as too pricey for 10 ml, says outright that a ₹199 mini would be perfect, and finally buys a ₹249 Minimalist 5% niacinamide 10 ml mini on Amazon.

Why it is valuable: it is a rare, unprompted record of *why* a budget student did not buy (shipping fee, price over budget, wanted a trial size) and what finally converted him. Surveys do not capture that.

**Buyer:** founder of a D2C skincare brand deciding whether to launch a ₹199 travel-size SPF trial pack.

## Seller steps (hissa.tech, **Seller** tab)

1. Click **↺** in the nav (clean state). Wait for "on-device model ready".
2. Upload `demo/om-skincare-chatgpt.json` in the drop zone (not "Use sample export"). Status reads "52 messages · 26 are yours".
3. Watch the "NOT YOURS · DROPPED" panel (the 26 assistant replies), then "ON YOUR DEVICE" masking.
4. Optional: in the extra-names box ("e.g. swapnil, anand") add nothing; NER should catch everything below.
5. "Classified in TEE" shows the facets. Click **Continue →**.
6. "YOU DECIDE": keep **Sell my record** and **Include me in anonymised analytics** on. Region defaults to IN (set IN-west if the field is shown). Click **Encrypt & publish**.

## What masking should hide

| Original | Masked |
| --- | --- |
| Om Dwivedi | [PERSON_n] |
| Priya, Rahul | [PERSON_n] |
| Andheri, Bandra, Mumbai | [PLACE_n] |
| +91 98200 12345 | [PHONE_n] (rule) |
| om.dwivedi.demo@example.com | [EMAIL_n] (rule) |

Prices, brand names and stores stay visible: they are the signal. If the NER misses a name (e.g. "Rahul"), add it in the extra-names box and apply before continuing.

## Expected 0G facets

Verified against the live API with the hand-masked text: `domain_path` beauty/skincare/oily-acne-prone-routine, age band 18-24, budget_consciousness high. Mentions: Minimalist serum (compared, too_expensive), Minimalist SPF (compared, abandoned, too_expensive), Dot & Key SPF and Deconstruct SPF (compared, too_expensive), Derma Co SPF (compared, used, recommended, fair), Dot & Key vitamin C serum (abandoned), Minimalist 5% mini (bought, used, recommended, fair), Nykaa (abandoned, shipping). Exact wording varies per run.

## Buyer steps (**Buyer** tab)

**Validate an idea.** Paste into "YOUR IDEA" (there is no separate hypothesis field; the idea text carries it):

```
Students in Mumbai drop skincare products over price and shipping fees. Would a ₹199 travel-size SPF trial pack convert them?
```

Click **Check against real data · 2 ℏ**. Verified parse: domain beauty, age 18-24, region IN-west, event abandoned; question "Why do students in Mumbai drop skincare products, and would a ₹199 travel-size SPF trial pack convert them?". The cohort quote returns 1 real + 69 synthetic seed people (labelled), k >= 50 so ok: true, price 2 ℏ.

**Buy training data.** Paste and click **Find data**:

```
18–24 year olds in Mumbai who abandoned sunscreen or serum because of price or shipping fees
```

Verified parse: beauty, 18-24, IN-west, abandoned. Om's listing should appear locked ("Free preview: tags only"); the agent pays 1 ℏ, then **Download .jsonl**.

## Expected outcome

The report runs on the seed panel plus Om (price is the biggest driver, "no visible results" second, a tail of irritation/texture/packaging). The seed panel carries price and results themes but nothing on shipping fees or trial sizes, so expect **Partly supported** (price is real, trial-size demand is only indirectly evidenced). Read whatever verdict appears; do not claim a fixed one. Om earns a share of the 80% contributor split, visible under "YOUR HISSA".

## Fallbacks

- NER model not ready: wait for "on-device model ready"; "basic masking only" still hides emails and phones but not names, so re-take.
- Parser error "Unsupported chat export": the file must be the ChatGPT array (`mapping` + `author.role`); the parser only reads the first conversation, so this export is one merged conversation.
- 0G slow or unavailable: narrate the flow steps; the sample export ("Use sample export") is the offline-safe path for the seller half.
- Verdict "Unclear": try the second idea below, which stresses price directly.
  `Young Indians are dropping skincare serums because they cost too much — a ₹299 trial size would sell.`
- No listing for Om in Buy training data: check the publish succeeded (LIVE ON ARKIV) and consent "Sell my record" was on; region filter IN-west needs a region of IN-west or IN.
- API down: check https://api.hissa.tech/health; do not fake success.
