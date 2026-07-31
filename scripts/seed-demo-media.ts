/**
 * Seeds AI-generated demo imagery into the KL Weekend Flavours workspace:
 * merchant covers by category, and a Moments feed of real food photos.
 *
 * Run with `pnpm db:seed:media`. Refuses to run in production.
 *
 * Reads from two untracked folders at the repo root (`Merchants/`, `Moments/`)
 * — drop new files in, update the MAPPING tables below, and re-run. The script
 * is idempotent for covers (re-uploading replaces the file row) and rebuilds the
 * Moments feed from scratch each time.
 *
 * ## Why this doesn't call `uploadImage`
 *
 * Two reasons, both structural rather than convenience:
 *
 *  1. `uploadImage` audits through `recordAudit`, which reads request
 *     `headers()` — there is no request here.
 *  2. `server/media/storage.ts` is marked `server-only`, which throws outside
 *     Next's bundler. `scripts/seed.ts` hit the same wall and set the precedent
 *     this follows: build a service-role client locally and write directly.
 *
 * What is *not* relaxed is the scoping. The object key is built to the same
 * **tenant-leading** shape `buildObjectPath` produces
 * (`{tenantId}/{scope}/{ownerId}/{uuid}.{ext}`), so a path can never address
 * another tenant's object, and the `files` row still carries a scoped
 * `tenant_id`.
 *
 * ## Why images are re-encoded here
 *
 * The generator emits 1792×592 PNGs at ~2 MB. The app renders covers at
 * 1200×400, so shipping the original wastes ~10× the bytes — and those bytes
 * count against the tenant's §22 storage limit. Chromium does the resize and
 * JPEG encode, which also lets us crop a bad strip off a frame.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const EVENT_SLUG = "weekend-flavours-2026";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local first.`);
  return value;
}

/**
 * The same shape `buildObjectPath` produces. Tenant-first so a path can never
 * address another tenant's object; every part is derived here, never from input.
 */
function objectPath(input: { tenantId: string; scope: string; ownerId: string }): string {
  return `${input.tenantId}/${input.scope}/${input.ownerId}/${randomUUID()}.jpg`;
}

// --- What each generated file is, and where it belongs --------------------

type CoverSpec = { file: string; category: string; cropTop?: number };

/**
 * `cropTop` trims a fraction off the top before reframing to 3:1. The Lifestyle
 * cover came back with a sign reading "Lifestyle" — the `[CATEGORY]` placeholder
 * from the prompt rendered as signage. Cropping the top strip removes it.
 */
const COVERS: CoverSpec[] = [
  { file: "0af8110e-bcd1-4510-911e-0ebe63a27086.jpeg", category: "Desserts" },
  { file: "Gemini_Generated_Image_3dgwd43dgwd43dgw (1).png", category: "Coffee" },
  { file: "Gemini_Generated_Image_3dgwd43dgwd43dgw (2).png", category: "Snacks" },
  { file: "Gemini_Generated_Image_3dgwd43dgwd43dgw (3).png", category: "Vegetarian" },
  { file: "Gemini_Generated_Image_3dgwd43dgwd43dgw (4).png", category: "Lifestyle", cropTop: 0.14 },
  { file: "Gemini_Generated_Image_3dgwd43dgwd43dgw.png", category: "Drinks" },
];

type PostSpec = {
  file: string;
  stall: string;
  body: string;
  rating: number | null;
  author: string;
};

/**
 * The crowd/atmosphere shot (`03827157-…`) is deliberately absent: it came back
 * with the brand hex code `#EC1F27` printed across eight festival banners,
 * because the prompt contained the literal code. See docs/image-prompts.md —
 * regenerate it with the corrected prompt and add it here.
 */
const POSTS: PostSpec[] = [
  {
    file: "dc19c826-e5f9-4f0d-970e-f6a77a4cc170.jpeg",
    stall: "Satay Bara KL",
    body: "Queued 20 minutes for this and I'd do it again. Ask for extra peanut sauce 🔥",
    rating: 5,
    author: "Wei Ming",
  },
  {
    file: "7c53b887-731f-4f0e-a94b-9240296c7cd7.jpeg",
    stall: "Cendol Kampung",
    body: "Cendol on a 34° afternoon = correct decision",
    rating: 5,
    author: "Nurul A.",
  },
  {
    file: "60600126-a3a5-41e2-bcef-b314543a467f.jpeg",
    stall: "Penang Wok Char Koay Teow",
    body: "Proper wok hei. You can hear it from three stalls away.",
    rating: 5,
    author: "Kamal R.",
  },
  {
    file: "b50b31e3-50f6-41ca-9048-1622bd08f170.jpeg",
    stall: "Nasi Lemak Nusantara",
    body: "Sambal is no joke. Bring a drink.",
    rating: 4,
    author: "Jia Yi",
  },
  {
    file: "75621171-8607-455a-82e9-ab302f22f9c9.jpeg",
    stall: "Banana Leaf Brothers",
    body: "Ate with my hands like nature intended. Refills are free 👀",
    rating: 5,
    author: "Priya S.",
  },
  {
    file: "e604c712-1d36-4faf-8556-f6507617a718.jpeg",
    stall: "Ais Kacang Club",
    body: "Half of it melted before I got to a table. Worth it.",
    rating: 4,
    author: "Hafiz M.",
  },
  {
    file: "87d4a058-1bc3-4b79-9dff-a34b0e3727c1.jpeg",
    stall: "Teh Tarik Studio",
    body: "Watched him pull this four times before handing it over. Showman.",
    rating: 5,
    author: "Mei Ling",
  },
  {
    file: "809e6f3f-8ca9-40b5-91e0-683b5f4cefeb.jpeg",
    stall: "Rendang Rumah Minang",
    body: "Slow-cooked all day and you can taste it. Get there before 8pm.",
    rating: 5,
    author: "Nurul A.",
  },
  {
    file: "4709713c-65d8-4e0f-9af6-55adf78be416.jpeg",
    stall: "Kuih Kita",
    body: "Bought one of each. No regrets, no self-control.",
    rating: 4,
    author: "Jia Yi",
  },
  {
    file: "e9a1f181-abc6-42d2-9cd1-76bfe98f7d0d.jpeg",
    stall: "Mamak Express",
    body: "Roti canai flipped to order at 10pm. This is the correct way to end a night.",
    rating: 5,
    author: "Kamal R.",
  },
];

const COMMENTS = [
  ["Which entrance is this near?", "Priya S."],
  ["Went yesterday, still thinking about it", "Hafiz M."],
  ["Queue was worth it 💯", "Mei Ling"],
  ["Saving this for Sunday", "Kamal R."],
  ["Is it halal?", "Nurul A."],
  ["Okay I'm going tonight", "Jia Yi"],
] as const;

// --- Image processing ------------------------------------------------------

type Processed = { bytes: Buffer; width: number; height: number };

/**
 * Resize + centre-crop to an exact frame and encode as JPEG, in Chromium.
 * `cropTop` drops a fraction off the top of the source first.
 */
async function processImages(
  jobs: Array<{ src: string; width: number; height: number; cropTop?: number }>,
): Promise<Processed[]> {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.setContent("<html><body></body></html>");
    const out: Processed[] = [];

    for (const job of jobs) {
      const ext = path.extname(job.src).toLowerCase();
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${readFileSync(job.src).toString("base64")}`;

      const base64 = await page.evaluate(
        async ({ dataUrl, width, height, cropTop }) => {
          const img = new Image();
          img.src = dataUrl;
          await img.decode();

          const srcTop = Math.round(img.naturalHeight * (cropTop ?? 0));
          const srcH0 = img.naturalHeight - srcTop;
          const srcW0 = img.naturalWidth;

          // Centre-crop the source to the target aspect, then scale to fit.
          const target = width / height;
          let sw = srcW0;
          let sh = Math.round(srcW0 / target);
          if (sh > srcH0) {
            sh = srcH0;
            sw = Math.round(srcH0 * target);
          }
          const sx = Math.round((srcW0 - sw) / 2);
          const sy = srcTop + Math.round((srcH0 - sh) / 2);

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d")!;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
          return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
        },
        { dataUrl, width: job.width, height: job.height, cropTop: job.cropTop ?? 0 },
      );

      out.push({ bytes: Buffer.from(base64, "base64"), width: job.width, height: job.height });
    }
    return out;
  } finally {
    await browser.close();
  }
}

// --- Main ------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed-demo-media is a development fixture; refusing to run in production.");
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (/\bprod\b/i.test(supabaseUrl)) {
    throw new Error("Refusing to seed demo media against a production-looking Supabase URL.");
  }
  const bucket = requireEnv("NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET");
  const supabase = createClient(supabaseUrl, requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  const { db } = await import("@/server/db");
  const { insertFile } = await import("@/server/db/repositories/files.repository");
  const schema = await import("@/server/db/schema");
  const {
    events,
    merchants,
    merchantCategories,
    merchantEventParticipations,
    momentComments,
    momentLikes,
    momentPosts,
    visitors,
  } = schema;

  const [event] = await db.select().from(events).where(eq(events.slug, EVENT_SLUG)).limit(1);
  if (!event) throw new Error(`Event "${EVENT_SLUG}" not found — run the importer first.`);
  const tenantId = event.tenantId;

  const [{ owner }] = await db.execute<{ owner: string }>(
    sql`select created_by as owner from events where id = ${event.id}`,
  );

  const upload = async (
    file: Processed,
    scope: string,
    ownerId: string,
    kind: string,
    originalName: string,
  ) => {
    const key = objectPath({ tenantId, scope, ownerId });
    const { error } = await supabase.storage
      .from(bucket)
      .upload(key, file.bytes, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`upload failed for ${originalName}: ${error.message}`);

    return insertFile({
      tenantId,
      bucket,
      path: key,
      kind,
      mimeType: "image/jpeg",
      sizeBytes: file.bytes.length,
      width: file.width,
      height: file.height,
      originalName,
      createdBy: owner,
    });
  };

  // --- Merchant covers ----------------------------------------------------

  console.log("Processing merchant covers…");
  const coverImages = await processImages(
    COVERS.map((c) => ({
      src: path.join("Merchants", c.file),
      width: 1200,
      height: 400,
      cropTop: c.cropTop,
    })),
  );

  let coveredMerchants = 0;
  for (const [i, spec] of COVERS.entries()) {
    const [cat] = await db
      .select()
      .from(merchantCategories)
      .where(and(eq(merchantCategories.tenantId, tenantId), eq(merchantCategories.name, spec.category)))
      .limit(1);
    if (!cat) {
      console.log(`  ! category "${spec.category}" not found — skipped`);
      continue;
    }

    const record = await upload(
      coverImages[i],
      `events/${event.id}/covers`,
      cat.id,
      "merchant_cover",
      spec.file,
    );

    // One file row shared by every merchant in the category — they're the same
    // picture, and duplicating the object would bill the tenant six times for it.
    const updated = await db
      .update(merchants)
      .set({ coverFileId: record.id })
      .where(and(eq(merchants.tenantId, tenantId), eq(merchants.categoryId, cat.id)))
      .returning({ id: merchants.id });

    coveredMerchants += updated.length;
    const kb = Math.round(coverImages[i].bytes.length / 1024);
    console.log(`  ${spec.category.padEnd(12)} → ${updated.length} merchants  (${kb} KB)`);
  }

  // --- Moments feed -------------------------------------------------------

  console.log("\nProcessing Moments photos…");
  const postImages = await processImages(
    POSTS.map((p) => ({ src: path.join("Moments", p.file), width: 1080, height: 1350 })),
  );

  // Resolve the demo authors, creating any that are missing.
  const authorNames = [...new Set([...POSTS.map((p) => p.author), ...COMMENTS.map((c) => c[1])])];
  const authorIds = new Map<string, string>();
  for (const name of authorNames) {
    const anonymousId = `demo-${name.toLowerCase().replace(/\W+/g, "-")}`;
    const [row] = await db
      .insert(visitors)
      .values({ anonymousId, displayName: name })
      .onConflictDoUpdate({ target: visitors.anonymousId, set: { displayName: name } })
      .returning();
    authorIds.set(name, row.id);
  }

  // Rebuild the feed rather than patching: the old fixtures had captions tagged
  // to the wrong stalls, and smoke-test rows had accumulated alongside them.
  const wiped = await db
    .delete(momentPosts)
    .where(eq(momentPosts.eventId, event.id))
    .returning({ id: momentPosts.id });
  console.log(`  cleared ${wiped.length} existing posts`);

  const created: string[] = [];
  for (const [i, spec] of POSTS.entries()) {
    const [stall] = await db
      .select({ id: merchantEventParticipations.id })
      .from(merchantEventParticipations)
      .innerJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
      .where(and(eq(merchantEventParticipations.eventId, event.id), eq(merchants.name, spec.stall)))
      .limit(1);
    if (!stall) {
      console.log(`  ! stall "${spec.stall}" not found — skipped`);
      continue;
    }

    const visitorId = authorIds.get(spec.author)!;
    const record = await upload(
      postImages[i],
      `events/${event.id}/moments`,
      visitorId,
      "moment_photo",
      spec.file,
    );

    const [post] = await db
      .insert(momentPosts)
      .values({
        tenantId,
        eventId: event.id,
        visitorId,
        participationId: stall.id,
        imageFileId: record.id,
        body: spec.body,
        rating: spec.rating,
        status: "published",
        // Spread over the last few hours so the feed isn't all "just now".
        createdAt: new Date(Date.now() - (POSTS.length - i) * 37 * 60 * 1000),
      })
      .returning();
    created.push(post.id);
    console.log(`  ${spec.stall.padEnd(28)} ${spec.rating}★  ${Math.round(postImages[i].bytes.length / 1024)} KB`);
  }

  // --- Likes & comments ---------------------------------------------------

  const everyone = [...authorIds.values()];
  let likes = 0;
  let comments = 0;
  for (const [i, postId] of created.entries()) {
    for (const visitorId of everyone.slice(0, 2 + ((i * 3) % 5))) {
      const r = await db
        .insert(momentLikes)
        .values({ tenantId, eventId: event.id, momentPostId: postId, visitorId })
        .onConflictDoNothing()
        .returning({ id: momentLikes.id });
      likes += r.length;
    }
    for (let k = 0; k < (i % 3 === 0 ? 2 : 1); k++) {
      const [body, author] = COMMENTS[(i + k) % COMMENTS.length];
      await db.insert(momentComments).values({
        tenantId,
        eventId: event.id,
        momentPostId: postId,
        visitorId: authorIds.get(author)!,
        body,
      });
      comments += 1;
    }
  }

  console.log(
    `\nDone. ${coveredMerchants} merchant covers, ${created.length} posts, ${likes} likes, ${comments} comments.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
