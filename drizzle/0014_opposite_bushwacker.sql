CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid,
	"merchant_id" uuid,
	"participation_id" uuid,
	"item_id" uuid,
	"booth_id" uuid,
	"zone_id" uuid,
	"visitor_id" uuid,
	"anonymous_id" text,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"source" text,
	"device_type" text,
	"browser" text,
	"referrer" text,
	"props" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_event_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"date" date NOT NULL,
	"metric" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_event_metrics_event_date_metric_uq" UNIQUE("event_id","date","metric")
);
--> statement-breakpoint
CREATE TABLE "daily_merchant_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"participation_id" uuid NOT NULL,
	"date" date NOT NULL,
	"metric" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_merchant_metrics_participation_date_metric_uq" UNIQUE("participation_id","date","metric")
);
--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid,
	"merchant_id" uuid,
	"participation_id" uuid,
	"short_code" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"target_path" text NOT NULL,
	"label" text,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_codes_short_code_uq" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "qr_scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"qr_code_id" uuid NOT NULL,
	"short_code" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"event_id" uuid,
	"merchant_id" uuid,
	"visitor_id" uuid,
	"anonymous_id" text,
	"device_type" text,
	"browser" text,
	"referrer" text,
	"country" text,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_participation_id_merchant_event_participations_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."merchant_event_participations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_item_id_listing_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."listing_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_booth_id_booths_id_fk" FOREIGN KEY ("booth_id") REFERENCES "public"."booths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_event_metrics" ADD CONSTRAINT "daily_event_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_event_metrics" ADD CONSTRAINT "daily_event_metrics_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_merchant_metrics" ADD CONSTRAINT "daily_merchant_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_merchant_metrics" ADD CONSTRAINT "daily_merchant_metrics_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_merchant_metrics" ADD CONSTRAINT "daily_merchant_metrics_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_merchant_metrics" ADD CONSTRAINT "daily_merchant_metrics_participation_id_merchant_event_participations_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."merchant_event_participations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_participation_id_merchant_event_participations_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."merchant_event_participations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_tenant_idx" ON "analytics_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "analytics_events_event_name_idx" ON "analytics_events" USING btree ("event_id","name");--> statement-breakpoint
CREATE INDEX "analytics_events_event_time_idx" ON "analytics_events" USING btree ("event_id","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_participation_idx" ON "analytics_events" USING btree ("participation_id");--> statement-breakpoint
CREATE INDEX "analytics_events_merchant_idx" ON "analytics_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "daily_event_metrics_tenant_idx" ON "daily_event_metrics" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "daily_event_metrics_event_date_idx" ON "daily_event_metrics" USING btree ("event_id","date");--> statement-breakpoint
CREATE INDEX "daily_merchant_metrics_tenant_idx" ON "daily_merchant_metrics" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "daily_merchant_metrics_merchant_date_idx" ON "daily_merchant_metrics" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "qr_codes_tenant_idx" ON "qr_codes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "qr_codes_event_idx" ON "qr_codes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "qr_codes_merchant_idx" ON "qr_codes" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "qr_scan_events_qr_code_idx" ON "qr_scan_events" USING btree ("qr_code_id");--> statement-breakpoint
CREATE INDEX "qr_scan_events_event_idx" ON "qr_scan_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "qr_scan_events_tenant_idx" ON "qr_scan_events" USING btree ("tenant_id");