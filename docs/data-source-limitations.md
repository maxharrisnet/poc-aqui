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

| Source | Listing-level data available? | Via |
|---|---|---|
| **eBay** | **Yes** | Official Browse API — seller location, condition, real shipping cost to Mexico |
| **Discogs** | **No** | Official API publishes aggregate statistics only. No endpoint returns the listings for a release |
| **Bandcamp** | **Announcements only, no prices** | Follow notifications sent to a dedicated mailbox — tells us a record was listed, never what it costs |

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

This also means a Bandcamp-only record has no cost breakdown to show — no
price, no origin, therefore no duty and no tax. That row is deliberately a
different shape from the others, because pretending otherwise would put a
fabricated number in front of a buying decision.

---

## What this means for scope

1. **eBay is the source that upgrades the product.** It converts the two
   softest numbers in the model — shipping and origin — from estimates into
   quoted facts.
2. **Discogs remains a pricing signal, not a listing feed.** It answers "what
   does this pressing generally go for and is anyone selling it", which is
   genuinely useful, and it will not answer more than that.
3. **Bandcamp is a supply feed, not a search.** It tells the desk when
   something worth having appears, and hands over a link. Useful, and
   deliberately not part of the cost engine.

The one open question is Discogs' ceiling: whether to accept a market price
without listing detail, or to pursue one of the narrower authorised routes.
A recommendation follows once the approach is mapped.
