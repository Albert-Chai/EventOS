CREATE TABLE "moment_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"moment_post_id" uuid NOT NULL,
	"visitor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moment_likes_post_visitor_uq" UNIQUE("moment_post_id","visitor_id")
);
--> statement-breakpoint
CREATE TABLE "moment_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"moment_post_id" uuid NOT NULL,
	"visitor_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"hidden_reason" text,
	"hidden_by" uuid,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_moment_post_id_moment_posts_id_fk" FOREIGN KEY ("moment_post_id") REFERENCES "public"."moment_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_moment_post_id_moment_posts_id_fk" FOREIGN KEY ("moment_post_id") REFERENCES "public"."moment_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moment_likes_post_idx" ON "moment_likes" USING btree ("moment_post_id");--> statement-breakpoint
CREATE INDEX "moment_likes_visitor_idx" ON "moment_likes" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "moment_likes_tenant_idx" ON "moment_likes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "moment_comments_post_created_idx" ON "moment_comments" USING btree ("moment_post_id","created_at");--> statement-breakpoint
CREATE INDEX "moment_comments_tenant_idx" ON "moment_comments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "moment_comments_event_idx" ON "moment_comments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "moment_comments_visitor_idx" ON "moment_comments" USING btree ("visitor_id");