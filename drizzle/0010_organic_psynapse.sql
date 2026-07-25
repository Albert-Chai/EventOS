CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anonymous_id" text NOT NULL,
	"user_id" uuid,
	"display_name" text,
	"email" text,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitors_anonymous_id_uq" UNIQUE("anonymous_id")
);
--> statement-breakpoint
CREATE TABLE "visitor_favourites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"participation_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_favourites_visitor_participation_uq" UNIQUE("visitor_id","participation_id")
);
--> statement-breakpoint
CREATE TABLE "visitor_recent_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"participation_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_recent_views_visitor_participation_uq" UNIQUE("visitor_id","participation_id")
);
--> statement-breakpoint
ALTER TABLE "visitor_favourites" ADD CONSTRAINT "visitor_favourites_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_favourites" ADD CONSTRAINT "visitor_favourites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_favourites" ADD CONSTRAINT "visitor_favourites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_favourites" ADD CONSTRAINT "visitor_favourites_participation_id_merchant_event_participations_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."merchant_event_participations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_favourites" ADD CONSTRAINT "visitor_favourites_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_recent_views" ADD CONSTRAINT "visitor_recent_views_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_recent_views" ADD CONSTRAINT "visitor_recent_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_recent_views" ADD CONSTRAINT "visitor_recent_views_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_recent_views" ADD CONSTRAINT "visitor_recent_views_participation_id_merchant_event_participations_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."merchant_event_participations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_recent_views" ADD CONSTRAINT "visitor_recent_views_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitor_favourites_visitor_event_idx" ON "visitor_favourites" USING btree ("visitor_id","event_id");--> statement-breakpoint
CREATE INDEX "visitor_favourites_tenant_idx" ON "visitor_favourites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "visitor_favourites_participation_idx" ON "visitor_favourites" USING btree ("participation_id");--> statement-breakpoint
CREATE INDEX "visitor_recent_views_visitor_event_idx" ON "visitor_recent_views" USING btree ("visitor_id","event_id");--> statement-breakpoint
CREATE INDEX "visitor_recent_views_tenant_idx" ON "visitor_recent_views" USING btree ("tenant_id");