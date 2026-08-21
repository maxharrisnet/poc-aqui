# Where the listing data can and cannot come from

**Status: draft — for review. Findings are settled; the Discogs recommendation is not.**

Version 0.2 prices a record from Discogs' published *marketplace statistics*:
for a given pressing, the lowest asking price and how many copies are for
sale. That is enough to prove the landed-cost engine, and it is what the demo
runs on today.

What it is not is a *listing*. A listing is a specific copy, offered by a
specific seller, in a stated condition, shipping from a known place, at a
known shipping cost. Everything the buying desk still does by hand — judging
condition, judging the seller, knowing what shipping will really cost —
depends on listing-level data.

This document records what each source will and will not give us, so the
scope of the next version is set by what is actually obtainable rather than
by what we assumed.

---

## The short version

Sources we intend to use, and what each one can actually answer.

| Source | Listing-level data? | Role |
|---|---|---|
| **eBay** | **Yes** | Real listings, seller location, quoted shipping to Mexico. One integration covers Germany, the UK, France, Italy and the Netherlands |
| **Mercado Libre** | **Yes** | Domestic Mexican listings — no customs, no import duty, no international lane |
| **Discogs** | **No** | Aggregate statistics only: lowest price and stock count. The deepest catalogue and the deepest German seller base, without per-copy detail |
| **Bandcamp** | **Announcements only** | Follow notifications to a dedicated mailbox. Tells us a record was listed, never what it costs |
| **EU specialist shops** | **Announcements only** | HHV, Hard Wax, Decks and similar. No APIs; newsletters into the same mailbox |
| **MusicBrainz** | **n/a** | Free open identity data — barcodes and release relationships. Underpins matching |
| **Spotify** | **No** | No vinyl at all. Canonical names and barcodes for matching |
| **Instagram** | **No** | Closed to us. The stores behind the accounts are the readable surface |

---

## eBay

eBay is the source that works, and it closes the single biggest gap in the
current model.

Its official Browse API returns real listings and, for each one:

- where the item actually ships **from**
- the stated condition
- the real shipping cost **to Mexico**, quoted by eBay rather than estimated
  by us

That last point matters more than it sounds. Two of the three "illustrative"
figures in the current model — shipping cost, and the country used to decide
customs treatment — become real numbers for any record found on eBay.

**What it needs from you:** an eBay developer account and a set of production
API credentials. Registration is free and self-service. There is nothing to
negotiate and no partnership to apply for.

**One integration covers Europe.** The same API serves each national
marketplace through a single parameter — Germany, the UK, France, Italy, the
Netherlands. Given how much of Ian's buying is European, and German in
particular, this is the cheapest coverage available to us anywhere on this
list: it is a query parameter, not a project.

**What it costs us in effort:** eBay listings are free text. They carry no
release identifier, so there is no direct join between "this exact pressing on
Discogs" and "these listings on eBay". Matching them — and being honest about
confidence when the match is uncertain — is the substantial engineering work
in this phase, considerably more than the API integration itself.

## Discogs

**Discogs' official API does not expose marketplace listings, and no
workaround exists inside their terms of use.**

The API publishes aggregate statistics for a pressing — lowest price, number
of copies for sale — and that is the whole of it. There is no endpoint that
returns "the copies currently for sale for this release". Condition,
seller location, and per-copy shipping are not available to us at all.

The data is plainly visible on the Discogs website, which makes this feel
like a technicality. It is not. Retrieving it would mean scraping pages
against their terms of use, which puts the account and the data supply at
risk. Version 0.1 was built on sanctioned endpoints only, deliberately, and
that position is why the integration has been stable.

There are narrower routes worth weighing later — reading the buyer's own
account data through an authorised login, or tracking the inventories of a
short list of known-good sellers. Both are limited, and neither is a general
answer.

**The practical consequence today:** the buying desk currently infers a
record's origin from where the pressing was manufactured, because that is all
Discogs gives us. A German pressing may well be sitting in a shop in
Guadalajara. It is right often enough to demonstrate the mechanism and wrong
often enough that we label it as an estimate everywhere it appears. On
Discogs it stays an estimate. On eBay it becomes a fact.

## Bandcamp

Bandcamp has no public catalogue or search API. Their developer API is built
for artists and labels to report on their own sales, not for buyers to search
what is for sale. There is no way to ask Bandcamp "who is selling this
record".

There is, however, a way to be *told* when something appears.

### The follow-email route

Bandcamp emails you the moment an artist or label you follow lists something
new. Those emails are machine-generated from a fixed template, so a dedicated,
unattended mailbox can receive them and the app can read them.

This is worth being precise about, because it is a genuine capability with a
genuine ceiling.

**What the emails contain:** the artist or label, the item title, a link to
the release, cover art, and the time it was listed.

**What they do not contain: any price.** No price, no stock count, no shipping
cost, no seller location. We reviewed five real examples and none carried a
figure of any kind.

The consequence is unavoidable: **a Bandcamp item cannot be given a landed
cost.** Price, origin and shipping are the three inputs the cost engine needs,
and the email supplies none of them. Bandcamp tells us a record exists. It
cannot tell us what it will cost to have it.

Four further limits, all found in the sample emails rather than assumed:

- **The link points at the release, not the item.** One email listed three
  distinct items — a denim vinyl LP, a signed copy of it, and a test pressing
  — all linking to the same page. The email cannot say which is which.
- **Format is free text, not a field.** The same batch mixed vinyl, a test
  pressing and two hardcover books. Filtering down to records means reading
  titles, and it will occasionally be wrong in both directions.
- **The notification is a moment, not a state.** It reports that something was
  listed on a date. Bandcamp pressings are frequently small and sell out
  quickly, so an item announced in March may well be long gone. The interface
  must show *when it was seen*, never "available".
- **Coverage is exactly the follow list.** This answers "what is new from the
  labels we track". It cannot answer "who has this record", which is the
  question the buying desk usually starts from.

### Managing the follow list

Following an artist is not something an outside application can do. Bandcamp
has no fan-side API — no way to follow a label, and no way to ask whether we
already do. The follow button on the website is driven by a logged-in browser
session, and automating that would mean operating Ian's personal account on
his behalf: fragile, and outside their terms.

The practical arrangement is the reverse, and it is simpler than it sounds:

**Ian follows labels on Bandcamp, exactly as he does now. The app learns the
roster from the mail.** Every notification carries a permanent identifier for
the label that sent it, so the first email from any label registers it
automatically, with no list to maintain in two places and nothing to keep in
sync.

The honest limit is that this can confirm a label is followed, but never that
one is not. A label Ian follows that has released nothing yet looks identical
to a label he has never followed.

## Spotify

Spotify is worth addressing because its API is genuinely open and generous,
and because the obvious hope — that it could reach the vinyl and merchandise
sold on artist pages — does not survive contact with it.

**Spotify is a streaming catalogue. It has no concept of a physical record.**
No format, no pressing, no stock, no price, no seller. It cannot tell us that a
record exists on vinyl, let alone what a copy costs.

**The merchandise on artist pages is not available through the API.** It is
sold through a third-party storefront integration rather than by Spotify
itself, and no public endpoint exposes it. It is visible on the page and
unreadable by us — a frustrating combination, but a firm one.

What Spotify is genuinely good for is the problem sitting underneath
everything else: **knowing that two records are the same record.**

- **Barcodes.** Spotify publishes a UPC or EAN for an album, and Discogs
  carries barcodes too, which gives us a real identifier to match on instead of
  comparing titles and hoping. One caveat that matters: Spotify's barcode is
  usually the digital release, which frequently differs from the barcode on the
  vinyl pressing. It is a strong hint, not proof.
- **Canonical names.** A single authoritative spelling of every artist and
  album, to reconcile eBay's free-text listing titles and Discogs' disambiguated
  names ("Atmosphere (2)") against.
- **Seeding the watchlist.** With Ian's permission, his saved albums and
  followed artists could populate the watchlist directly — a considerably
  better start than typing records in one at a time.

Two constraints to plan around: Spotify withdrew several endpoints from new
applications in late 2024, including recommendations and audio features, so
nothing should be built on those; and an application in development mode is
limited to **five** authenticated users, each allowlisted by hand. Extended
quota is no longer realistically available — since May 2025 Spotify has only
accepted applications from organisations with around 250,000 monthly users.

Five is enough for Ian and for us. It does mean this can never become a feature
the shop's customers use, which is worth knowing before anyone imagines it as
one.

Spotify does not reduce the dependency on eBay. It makes the matching that
eBay requires substantially more reliable.

---

## Mercado Libre

For a buyer based in Mexico this is the most valuable source on the list after
eBay, and arguably before it.

**Domestic listings skip the entire import problem.** No customs, no duty, no
tasa global, no international shipping lane, no formal-entry threshold. The
landed cost collapses to the price plus domestic postage — which means it is
also the one source where our number is exact rather than estimated.

Its catalogue search is a public resource in the sense that matters — no
seller's authorisation is needed to read active listings, only our own
application token. (Tested: the endpoint returns 403 without one, so "public"
should not be read as "open".) The matching problem is the same free-text one
eBay poses, and the same work solves both.

One wrinkle worth knowing before we rely on stock counts: Mercado Libre now
returns available quantity as a coarse band rather than a number.

## MusicBrainz

Free, open, no API key, and the answer to the hardest unsolved part of the
system.

Everything above depends on knowing that an eBay listing, a Discogs pressing
and a Bandcamp announcement are the same record. MusicBrainz publishes
barcodes, release groups and the relationships between pressings, maintained by
people who care about exactly the distinctions a record buyer cares about. It
finds nothing and prices nothing; it makes every other source more reliable.

It is the cheapest item on this list and probably the highest leverage.

## European specialist shops

Ian buys heavily from Europe, and Germany especially, so this deserves its own
answer rather than being folded into "shops".

**We tested the obvious route and it does not work.** Most independent
retailers worldwide run Shopify, which publishes a full product catalogue as
JSON on the shop's own domain, with no key and no login — an excellent,
sanctioned feed. We checked nine of the shops that matter here: HHV, Hard Wax,
Decks, Deejay, Rush Hour, Clone, Phonica, Boomkat and Juno. **None of them runs
Shopify, and none exposed a usable product feed.** They are all bespoke
platforms. We probed the same shops for RSS and found nothing either.

The Shopify route still works for smaller boutique stores. It does not reach
the German tier.

**So these shops come in through the mailbox**, the same way Bandcamp does.
They all send new-arrival newsletters, and one dedicated inbox can hold several
parsers as easily as one. This is worth noticing about the Bandcamp work: it is
not a Bandcamp feature. It is a shop-notification pipeline, and Bandcamp merely
happens to be its first tenant.

### The VAT problem

Separate from any integration, and worth more than most of them.

**A German seller's listed price includes 19% VAT.** Discogs provides no
mechanism for an EU seller to deduct that VAT at checkout for a buyer outside
the EU, and its Seller Policy requires that the listed price be final — a
seller may not adjust tax after purchase. So the price a Mexican buyer pays
appears to be the VAT-inclusive one, with Mexican IVA applied on top.

**We could not confirm this from Discogs' own published documentation**, and we
are not going to assert it to a client on inference alone. The article that
would settle it sits behind a seller login. This needs checking against two or
three of Ian's actual German orders before it goes any further than a
hypothesis — which is why it is the first question on the list for him.

Two consequences, one operational and one for the software:

- **Ian may be paying tax twice on every German purchase**, and may be able to
  stop simply by asking sellers to deduct VAT on export.
- **Our cost engine is comparing unlike things.** A €20 German listing and a
  $22 American one look equivalent, but a fifth of the German price is foreign
  tax the American one does not carry. Sorting cheapest-first is quietly biased
  against non-EU sellers until this is modelled.

This needs confirming against two or three of Ian's actual German orders before
we build anything on it.

## Japan, and other places we are not going

Worth recording so the same ground is not covered twice.

**Japan is where rare Japanese pressings trade, and it is effectively closed to
us.** Yahoo! Auctions is the venue that matters; API access for non-Japanese
entities is restrictive, and most foreign buyers go through proxy services that
publish no APIs at all. Rakuten's item search API explicitly excludes auction
and C2C listings — precisely the inventory worth having. Treat Japan as a
manual lane.

**Instagram is a shop window, not a stock feed.** A great deal of dealing
genuinely happens there, so the instinct to watch it is right; the access is
not there. The Graph API reaches only accounts you own or manage, with no route
to third-party profiles or public content, and hashtag search is both capped
and scoped to your own account. Reading other people's posts programmatically
is scraping, against Meta's terms, and enforced. The useful move is indirect:
most dealer accounts link to a store, and the store is the machine-readable
surface.

**Two we have not verified and would want to before recommending:** Catawiki,
the Dutch auction house that moves a lot of collectible vinyl, and CDandLP, the
largest European used marketplace after Discogs. Kleinanzeigen — Germany's
classifieds, and full of cheap used records — has no public API and is a dead
end.

## What the interface can honestly promise

The three sources give three different kinds of answer, and the buying desk
should be able to see which is which without reading a footnote. In practice
that means each record offers up to three routes to buy, labelled with what is
actually known:

| | What the button can say | What it means |
|---|---|---|
| **Discogs** | *from $X · 6 copies* | A real market price. Which copy, and where it ships from, are unknown |
| **eBay** | *4 listings · from $X landed* | The full landed figure, on a specific copy from a known place |
| **Bandcamp** | *seen 6 Mar* | It was listed on that date. No price, and possibly gone |

Only the eBay figure is a landed cost. The Discogs figure is a market price
with the import cost estimated around it. The Bandcamp entry is a lead.

This also means a record found only on Bandcamp has no cost breakdown to show —
no price, no origin, therefore no duty and no tax. **Agreed treatment: that row
drops the cost bar entirely, says plainly that pricing is not available, and
offers the buy buttons underneath.** An empty bar or a zeroed one would both
read as information; a sentence saying we do not know is the only honest
version, and it costs the desk nothing — the link is what they wanted anyway.

---

## What this means for scope

1. **eBay is the source that upgrades the product**, and it covers Europe for
   free. It converts the two softest numbers in the model — shipping and origin
   — from estimates into quoted facts, across every marketplace Ian buys from.
2. **Mercado Libre is the one source with no import problem at all.** Worth
   confirming how much Ian buys domestically before ranking it.
3. **MusicBrainz first, because everything else depends on it.** Matching is
   the load-bearing problem, and this is the cheapest way to make it tractable.
4. **Discogs remains a pricing signal, not a listing feed.** It answers "what
   does this pressing generally go for and is anyone selling it", which is
   genuinely useful, and it will not answer more than that.
5. **Spotify is an identity layer.** It cannot find or price a record, and its
   merch is closed to us. It earns its place on barcodes and canonical names.
6. **Bandcamp and the European shops share one pipeline.** A dedicated mailbox
   with a parser per sender, producing leads rather than prices.
7. **Japan and Instagram are out of reach.** Both are real sources of records
   and neither is addressable; recorded here so the ground is not covered twice.

The open questions that need Ian rather than research — the German VAT
position, how much he buys domestically, and which specific shops are worth a
parser — are collected in `questions-for-ian.md`.
