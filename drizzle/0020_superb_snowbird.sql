CREATE TABLE "moment_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"visitor_id" uuid NOT NULL,
	"author_user_id" uuid,
	"participation_id" uuid,
	"image_file_id" uuid,
	"body" text,
	"rating" smallint,
	"status" text DEFAULT 'published' NOT NULL,
	"hidden_reason" text,
	"hidden_by" uuid,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "enable_moments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "moment_posts" ADD CONSTRAINT "moment_posts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_posts" ADD CONSTRAINT "moment_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_posts" ADD CONSTRAINT "moment_posts_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_posts" ADD CONSTRAINT "moment_posts_participation_id_merchant_event_participations_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."merchant_event_participations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_posts" ADD CONSTRAINT "moment_posts_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moment_posts_tenant_idx" ON "moment_posts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "moment_posts_event_created_idx" ON "moment_posts" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "moment_posts_participation_idx" ON "moment_posts" USING btree ("participation_id");--> statement-breakpoint
CREATE INDEX "moment_posts_visitor_idx" ON "moment_posts" USING btree ("visitor_id");