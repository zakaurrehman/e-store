import { ReviewStatus, StoreStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/**
 * Demo store reviews — sample data for testing and for showing the reviews UI, never real customers.
 * Every one is saved with isDemo=true, which labels it "Demo review" wherever it appears and lets staff
 * remove them all in one step (Admin → Store reviews). They have no order behind them.
 *
 * Spread over the demo store and up to three owner stores. Re-running replaces those stores' demo reviews
 * rather than adding more. Refused when NODE_ENV=production.
 */

type DemoReview = { rating: 3 | 4 | 5; author: string; body: string; daysAgo: number; reply?: string };

const REVIEWS: DemoReview[] = [
  { rating: 5, author: "Sofia R.", daysAgo: 3, body: "Ordered on Monday, here by Thursday. Everything was wrapped with care and exactly as pictured." },
  { rating: 5, author: "James T.", daysAgo: 6, body: "Second order from this shop and just as good as the first. Easy checkout, quick delivery." },
  { rating: 4, author: "Aisha K.", daysAgo: 9, body: "Lovely quality. Delivery took a couple of days longer than I hoped, but they kept me updated.", reply: "Thank you, Aisha — sorry for the wait, and glad you like it!" },
  { rating: 5, author: "Daniel M.", daysAgo: 12, body: "Bought a gift and it arrived beautifully packed. The tracking link worked the whole way." },
  { rating: 3, author: "Chloe B.", daysAgo: 15, body: "Nice product, though the colour was a little darker than the photos. Customer service answered quickly." },
  { rating: 4, author: "Omar H.", daysAgo: 19, body: "Good value and well made. I'd have liked a few more size notes on the page." },
  { rating: 5, author: "Hannah L.", daysAgo: 23, body: "Really pleased. Fast shipping and the item feels much more expensive than it was.", reply: "Thanks so much, Hannah!" },
  { rating: 4, author: "Lucas P.", daysAgo: 27, body: "Arrived in good condition and on time. Would order again." },
  { rating: 5, author: "Mei W.", daysAgo: 31, body: "Smooth from start to finish. I had a question about my order and got a reply the same day." },
  { rating: 3, author: "Ryan O.", daysAgo: 36, body: "Took about a week to arrive. Product is fine, packaging could have been sturdier." },
  { rating: 5, author: "Isabella G.", daysAgo: 41, body: "My new favourite shop for small gifts. Everything I've bought has been great." },
  { rating: 4, author: "Noah F.", daysAgo: 46, body: "Solid experience overall. Clear order updates and the parcel was well protected." },
  { rating: 5, author: "Fatima Z.", daysAgo: 52, body: "Exactly what I was looking for, and cheaper than elsewhere. Quick delivery too." },
  { rating: 4, author: "Ethan C.", daysAgo: 58, body: "Happy with my purchase. One item came in a separate parcel, but both arrived the same week." },
  { rating: 5, author: "Grace N.", daysAgo: 64, body: "Beautiful quality and it arrived sooner than the estimate. Thank you!", reply: "Thank you, Grace — enjoy!" },
  { rating: 3, author: "Liam D.", daysAgo: 70, body: "Decent product. I had to ask for the tracking number, but once I did it came right away." },
  { rating: 5, author: "Zara A.", daysAgo: 77, body: "Great little shop. Checkout was quick and the order was exactly as described." },
  { rating: 4, author: "Mateo S.", daysAgo: 84, body: "Good quality for the price. Delivery was on the slower side but still within the estimate." },
  { rating: 5, author: "Amelia J.", daysAgo: 91, body: "Ordered twice now, both times perfect. Lovely packaging and very fast." },
  { rating: 4, author: "Samuel E.", daysAgo: 98, body: "Nice products and friendly service. I'd give five stars if shipping were a little quicker." },
  { rating: 5, author: "Layla V.", daysAgo: 106, body: "Very happy. The item looks even better in person and it came well wrapped." },
  { rating: 4, author: "Henry Y.", daysAgo: 114, body: "Straightforward order, arrived as promised. Would recommend." },
  { rating: 5, author: "Nora I.", daysAgo: 123, body: "Fast, careful and exactly as pictured. I've already recommended the shop to a friend." },
  { rating: 3, author: "Oliver U.", daysAgo: 132, body: "Product is good, but I was expecting it a few days sooner. Support were helpful when I asked." },
];

/** How many demo reviews each chosen store gets: the demo store takes the most. */
const SHARES = [9, 5, 5, 5];

export async function seedDemoStoreReviews() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo store reviews are refused in production.");

  const platform = await db.store.findFirst({ where: { ownerId: null, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const owners = await db.store.findMany({ where: { ownerId: { not: null }, deletedAt: null, status: StoreStatus.ACTIVE }, orderBy: { createdAt: "asc" }, take: 3, select: { id: true, name: true } });
  const stores = [...(platform ? [platform] : []), ...owners];
  if (stores.length === 0) {
    console.log("• demo store reviews: no stores yet — skipped");
    return;
  }

  // Replace, never pile up: these stores' earlier demo reviews go first.
  await db.storeReview.deleteMany({ where: { isDemo: true, storeId: { in: stores.map((store) => store.id) } } });
  let next = 0;
  const now = Date.now();
  const rows = stores.flatMap((store, index) => {
    // With fewer stores, the ones there are share every review.
    const share = index === stores.length - 1 ? REVIEWS.length - next : Math.min(SHARES[index] ?? 5, REVIEWS.length - next);
    const picked = REVIEWS.slice(next, next + share);
    next += share;
    return picked.map((review) => {
      const createdAt = new Date(now - review.daysAgo * 86_400_000);
      return {
        storeId: store.id,
        rating: review.rating,
        body: review.body,
        authorName: review.author,
        status: ReviewStatus.APPROVED,
        isDemo: true,
        ownerReply: review.reply ?? null,
        ownerRepliedAt: review.reply ? new Date(createdAt.getTime() + 86_400_000) : null,
        createdAt,
        moderatedAt: createdAt,
      };
    });
  });
  await db.storeReview.createMany({ data: rows });
  console.log(`✓ demo store reviews: ${rows.length} across ${stores.length} store(s) (${stores.map((store) => store.name).join(", ")}) — all marked as demo data`);
}
