import { averageRating } from "@/server/moments/status";

/**
 * Which stalls the loaded feed is talking about, most-posted first.
 *
 * Deliberately derived from the posts already on the page rather than a fresh
 * aggregate query: the desktop rail is a summary *of this feed*, and on the
 * dev/test pooler (one connection) an extra round trip per page view is a real
 * cost for a sidebar. That's also why the UI labels it "in this feed" — it is
 * not the event's all-time top-rated list, and must not claim to be.
 */
export type FeedStall = {
  slug: string;
  name: string;
  posts: number;
  /** Mean of the ratings present, or null when nobody rated it. */
  rating: number | null;
};

export function stallsInFeed(
  posts: readonly {
    merchantSlug: string | null;
    merchantName: string | null;
    rating: number | null;
  }[],
): FeedStall[] {
  const acc = new Map<string, { name: string; posts: number; ratings: number[] }>();

  for (const post of posts) {
    if (!post.merchantSlug || !post.merchantName) continue;
    const entry = acc.get(post.merchantSlug) ?? { name: post.merchantName, posts: 0, ratings: [] };
    entry.posts += 1;
    if (post.rating !== null) entry.ratings.push(post.rating);
    acc.set(post.merchantSlug, entry);
  }

  return [...acc.entries()]
    .map(([slug, { name, posts, ratings }]) => ({
      slug,
      name,
      posts,
      rating: averageRating(ratings),
    }))
    .sort(
      (a, b) =>
        b.posts - a.posts || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name),
    );
}
