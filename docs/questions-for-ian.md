# Questions for Ian

**Internal. Not published on the site.**

Collected as they come up, so nothing has to be reconstructed from memory before
a meeting. Each one is here because the answer changes what gets built, not
because it would be nice to know.

Ordered by what it costs us to guess wrong.

---

## 1. The German VAT question 💶: money, possibly today

**Ask:** When you buy from a German or other EU seller on Discogs, has anyone
ever deducted VAT from the price because you're outside the EU? Can you pull up
two or three recent German orders so we can look at what you actually paid?

**Why it matters.** A German seller's listed price includes 19% VAT. Discogs
offers EU sellers no way to deduct it at checkout for a buyer outside the EU,
and its Seller Policy requires the listed price to be final. So the price shown
appears to be VAT-inclusive, with Mexican IVA charged on top. If that is what
has been happening, he has been taxed twice on every German purchase.

**Caveat, and the reason this is a question rather than a finding.** We could
not confirm it from Discogs' published documentation. The page that would
settle it is behind a seller login. His actual orders are the fastest way to
know.

Two things follow. He may be able to recover it going forward simply by asking
sellers to deduct VAT on export. And our cost engine is currently comparing
unlike things: a €20 German listing and a $22 US listing look equivalent, but
the German one carries a fifth of its price in foreign tax that the US one
doesn't. Cheapest-first sorting is quietly biased.

**What we do with the answer:** if confirmed, VAT becomes a modelled line in the
cost breakdown rather than an invisible part of the price.

---

## 2. Which sources actually matter to him 🌍

**Ask:** Roughly what share of your buying is Discogs, eBay, direct from
European shops, and Bandcamp? And which specific shops: HHV, Hard Wax, Decks,
someone else?

**Why it matters.** We can build eBay for Germany almost free: it's one
parameter on an integration already planned. The big European specialists have
no APIs at all and each needs its own newsletter parser, so the shop list has to
be worth the work. Naming five shops is a different project from naming twenty.

---

## 3. Mexican domestic supply 🇲🇽

**Ask:** Do you ever buy from Mercado Libre, or from sellers inside Mexico? Is
that a real source of stock or a rounding error?

**Why it matters.** Domestic listings skip customs, import duty and the
international shipping lane entirely. The cost engine collapses to price plus
domestic postage, and the answer is available today rather than after an
integration. If he buys domestically at all, Mercado Libre may be worth more
than eBay. If he never does, it drops down the list.

---

## 4. What "watch" should mean once inventory exists 📉

**Ask:** When a record sells out on the shelf, should the system start hunting
for a replacement by itself? Are there titles you always want in stock,
regardless?

**Why it matters.** This decides whether the stock threshold is a per-title
number, a simple always-watch flag, or both. It's the difference between a
watchlist he maintains and one that maintains itself.

**What the tool does today:** both. Every title carries a restock count that
switches its watch on by itself, and a watch switch that can be set by hand
regardless. A record the shop has never stocked is a row with no copies yet.

---

## 5. Intake: how a parcel becomes stock 📥

**Ask:** When a record arrives, what happens now? Who touches it, and where does
it get written down?

**Why it matters.** This is one of the two genuinely unsolved boxes in the
system. A parcel lands weeks after the decision to buy it, and something has to
turn it into an inventory row carrying its real landed cost without anyone
retyping it. Scanning a barcode at the counter, confirming against the order
that triggered the buy, and reconciling by hand are all plausible. His actual
handling routine decides which.

---

## 6. Who receives the alerts 🔔

**Ask:** Whose phone should a rare-find alert reach, just yours, or the shop's
as well? Are the numbers Mexican?

**Why it matters.** Practical, and it costs money: texting Mexican numbers is
several times the US rate and needs sender registration before anything
delivers. Also worth knowing whether an alert at 3am is welcome or a problem.

---

## 7. Condition standards 💿

**Ask:** What's your floor? Would you take a VG+ sleeve on a record you want
badly, or is NM the line?

**Why it matters.** eBay gives us condition per listing, which is the first time
we can actually filter on it. Without a rule the cheapest copy wins, and the
cheapest copy is often cheap for a reason.

---

## 8. Spotify library as a starting point 🎧

**Ask:** Would you be willing to connect your Spotify account so we can seed the
watchlist from your saved albums and followed artists?

**Why it matters.** It replaces typing records in one at a time. It's optional
and it needs his explicit sign-in, so it's worth asking before building.

---

## Answered

*Nothing yet: move items here with the answer and the date.*
