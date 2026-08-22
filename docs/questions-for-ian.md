# Questions for Ian

**Internal. Not published on the site. The client-facing version is the "Questions for you" page of the demo guide (22 August 2026).**

Ordered by what it costs us to guess wrong. Each entry says what the answer changes,
so the list can be trimmed without losing the reasoning.

## The five that change what we build next

1. **His existing list of 800+ titles.** What form (Discogs export, spreadsheet, something
   else), and what each row holds: condition, what he paid and in which currency, shelf
   price, copies. *Why:* it becomes the inventory. The import script maps his columns to
   the sheet's (artist, album, condition, qty, landed_cost_mxn, shelf_price_mxn, notes)
   and the enrich script fills release, sleeve, year and pressings from Discogs. Costs in
   USD or EUR need a rate and a date to become landed pesos. Also: which titles should
   start with their watch on, and whether the list is stock, wants, or both.

2. **Where he buys, by share.** Discogs / eBay (which national sites) / European shops
   (which: HHV, Hard Wax, Decks, Deejay, Rush Hour, Clone, Phonica, Boomkat, Juno) /
   Bandcamp / Mercado Libre or Mexican sellers. *Why:* sets the build order. eBay by
   country is a parameter; each European shop is a newsletter parser, so the shop list has
   to be worth the work. If he buys domestically at all, Mercado Libre may outrank eBay.

3. **German VAT.** On recent orders from German Discogs sellers, was 19% VAT deducted?
   Two or three order totals settle it. *Why:* possible double taxation today (VAT in the
   price, IVA on top) and a quiet bias in our cheapest-first sort against non-EU sellers
   until VAT is modelled as a line. We could not confirm it from Discogs' published docs.

4. **Alerts.** Whose phone, Mexican numbers or not, SMS or WhatsApp, quiet hours.
   *Why:* Mexican SMS needs sender registration before anything delivers and costs
   several times the US rate; WhatsApp Business has its own onboarding. Decides the
   gateway and the cost line.

5. **Customs broker introduction.** Will they validate duty, IVA, tasa global and the
   formal-entry threshold? *Why:* we will not put tax numbers into software without a
   qualified person confirming them. The rules live in a versioned table so a broker can
   correct them without a code change.

## When he has a minute

6. **Restock counts.** Is one copy left the right default, or per title? Always-in-stock
   titles? *Why:* decides whether `min_qty` is seeded as 1 for everything or left blank.
7. **Alert price.** Absolute pesos per record, or a rule (a percentage of shelf price or
   of last landed cost)? *Why:* if a rule, `max_landed_mxn` can be derived for all 800
   rows instead of typed; if absolute, the import leaves it blank.
8. **Pressings.** For albums with many pressings (Autobahn has 143), what should a watch
   cover: originals only, any vinyl, certain countries? *Why:* the pressing picker for
   masters above the ten-pressing limit is not built; his answer decides whether it needs
   to be, or whether a country rule does the job.
9. **Condition floor.** VG+ acceptable, or NM only? *Why:* eBay can filter on it, Discogs
   cannot (stats carry no condition), so the Discogs figure may be a Poor copy.
10. **Sweep cadence.** A few times a day, or hourly for rare wants? *Why:* Discogs allows
    60 calls a minute, two per pressing; 800 titles with watches on is not sweepable
    hourly. Tiers by priority, and the watch switch, are the levers.
11. **Shipping today.** Direct courier or a forwarder; real shipping costs for a few
    lanes (DE, UK, US, JP). *Why:* calibrates the illustrative shipping table until eBay
    quotes and purchase history replace it; consolidation may be materially cheaper under
    the 2026 rules.
12. **Bandcamp.** Which account follows the labels; fine to route notifications to a
    mailbox we read? *Why:* the follow list is the coverage; the first email from a label
    registers it. We cannot follow labels on his behalf.
13. **The spreadsheet.** Happy in Google Sheets for now; whose Google account owns it (and
    the Bandcamp mailbox)? *Why:* the service account has to be shared on the sheet;
    ownership should be the shop's, not ours.
14. **Access.** Who else gets the link; password or not? *Why:* the link writes to the
    sheet. Vercel password protection is a Pro-plan feature (~USD 20/month); Vercel
    Authentication would require a Vercel login, which he does not have.
15. **Spotify seed (optional).** Connect his account to seed wants from saved albums and
    followed artists? *Why:* dev-mode apps allow five allowlisted users; needs his sign-in.
16. **Trade-ins and counter buys.** A real source of stock? *Why:* they arrive without an
    order, so intake (one of the two unproven boxes) has to accept a copy with no
    purchase behind it.
17. **Timing.** When does he need it working for real; when does the shop open? *Why:*
    sets the Phase 1 schedule and whether the website lands before or after.

## From the 6 August brief, still unanswered as far as our notes show

Not in the client PDF, to keep that list short. Raise on the call.

- **CFDI 4.0 / facturación.** Who handles invoicing; does Clip's facturación cover it, or
  is a stamping service needed? Legal requirement before the store opens.
- **Rekordbox.** Confirm the real want is BPM and key on listings, not inventory sync.
- **Buying rules.** Fixed margin, maximum price, or by feel? The scoring engine needs a
  rule; the retail markup default is deliberately unset until he names it.
- **Retail platform.** Committed to anything? Common Ground trial started?
- **Buyers club.** Listed in the SOW, never defined.
- **Tracked labels, distributors and stores.** The template for Phase 2; quoting waits on it.

## Answered

*Nothing yet. Move items here with the answer and the date.*
