CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"event_type" text DEFAULT 'other' NOT NULL,
	"short_description" text,
	"description" text,
	"venue_name" text,
	"venue_address" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text DEFAULT 'Asia/Kuala_Lumpur' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"require_visitor_login" boolean DEFAULT false NOT NULL,
	"enable_favourites" boolean DEFAULT true NOT NULL,
	"enable_reviews" boolean DEFAULT false NOT NULL,
	"enable_vouchers" boolean DEFAULT false NOT NULL,
	"enable_sponsors" boolean DEFAULT false NOT NULL,
	"enable_passport" boolean DEFAULT false NOT NULL,
	"enable_maps" boolean DEFAULT true NOT NULL,
	"enable_merchant_self_registration" boolean DEFAULT false NOT NULL,
	"enable_guest_browsing" boolean DEFAULT true NOT NULL,
	"show_merchant_prices" boolean DEFAULT true NOT NULL,
	"show_booth_number" boolean DEFAULT true NOT NULL,
	"show_operating_hours" boolean DEFAULT true NOT NULL,
	"show_social_links" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_settings_event_uq" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "event_branding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"theme" text DEFAULT 'classic' NOT NULL,
	"primary_color" text DEFAULT '#0f172a' NOT NULL,
	"secondary_color" text,
	"accent_color" text,
	"logo_file_id" uuid,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_branding_event_uq" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "event_operating_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"date" date NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"is_closed" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_operating_hours_event_date_uq" UNIQUE("event_id","date")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_settings" ADD CONSTRAINT "event_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_settings" ADD CONSTRAINT "event_settings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_branding" ADD CONSTRAINT "event_branding_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_branding" ADD CONSTRAINT "event_branding_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_operating_hours" ADD CONSTRAINT "event_operating_hours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_operating_hours" ADD CONSTRAINT "event_operating_hours_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_tenant_status_idx" ON "events" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "event_settings_tenant_idx" ON "event_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_branding_tenant_idx" ON "event_branding" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_operating_hours_tenant_idx" ON "event_operating_hours" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_operating_hours_event_idx" ON "event_operating_hours" USING btree ("event_id");