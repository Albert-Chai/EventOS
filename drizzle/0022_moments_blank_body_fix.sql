-- Fix to the content CHECK added in 0021.
--
-- `btrim(x)` trims **spaces only** — not tabs, newlines, or carriage returns. So
-- a body of "   \n  " passed `btrim(coalesce(body,'')) <> ''` and an effectively
-- empty post could be written. The service never produced one (JS `.trim()` does
-- strip newlines), which is exactly why this had to be caught by a test against
-- the database rather than by reading the service.
--
-- The replacement asserts the body contains at least one non-whitespace
-- character, which is the rule we actually meant and doesn't depend on knowing
-- the trim set.

--> statement-breakpoint
ALTER TABLE "moment_posts" DROP CONSTRAINT "moment_posts_has_content_ck";
--> statement-breakpoint
ALTER TABLE "moment_posts"
  ADD CONSTRAINT "moment_posts_has_content_ck"
  CHECK ("image_file_id" IS NOT NULL OR coalesce("body", '') ~ '[^[:space:]]');
