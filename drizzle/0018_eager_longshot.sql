CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website_url" text,
	"contact_email" text,
	"logo_file_id" uuid,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsors_tenant_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "ad_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"creative_file_id" uuid,
	"alt_text" text,
	"click_url" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"weight" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_creative_file_id_files_id_fk" FOREIGN KEY ("creative_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsors_tenant_idx" ON "sponsors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ad_bookings_tenant_idx" ON "ad_bookings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ad_bookings_sponsor_idx" ON "ad_bookings" USING btree ("sponsor_id");--> statement-breakpoint
CREATE INDEX "ad_bookings_event_slot_idx" ON "ad_bookings" USING btree ("event_id","slot","status");