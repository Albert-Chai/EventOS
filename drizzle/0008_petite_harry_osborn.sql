CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"original_name" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_bucket_path_uq" UNIQUE("bucket","path")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"name" text NOT NULL,
	"image_file_id" uuid,
	"image_width" integer,
	"image_height" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text DEFAULT 'Event map' NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"zone_id" uuid,
	"map_floor_id" uuid,
	"booth_number" text NOT NULL,
	"name" text,
	"x" double precision DEFAULT 0.5 NOT NULL,
	"y" double precision DEFAULT 0.5 NOT NULL,
	"width" double precision DEFAULT 0.06 NOT NULL,
	"height" double precision DEFAULT 0.06 NOT NULL,
	"rotation" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booth_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"booth_id" uuid NOT NULL,
	"participation_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_floors" ADD CONSTRAINT "map_floors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_floors" ADD CONSTRAINT "map_floors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_floors" ADD CONSTRAINT "map_floors_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_floors" ADD CONSTRAINT "map_floors_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booths" ADD CONSTRAINT "booths_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booths" ADD CONSTRAINT "booths_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booths" ADD CONSTRAINT "booths_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booths" ADD CONSTRAINT "booths_map_floor_id_map_floors_id_fk" FOREIGN KEY ("map_floor_id") REFERENCES "public"."map_floors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booth_assignments" ADD CONSTRAINT "booth_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booth_assignments" ADD CONSTRAINT "booth_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booth_assignments" ADD CONSTRAINT "booth_assignments_booth_id_booths_id_fk" FOREIGN KEY ("booth_id") REFERENCES "public"."booths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booth_assignments" ADD CONSTRAINT "booth_assignments_participation_id_merchant_event_participations_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."merchant_event_participations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booth_assignments" ADD CONSTRAINT "booth_assignments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_tenant_idx" ON "files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "zones_tenant_idx" ON "zones" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "zones_event_idx" ON "zones" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "map_floors_tenant_idx" ON "map_floors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "map_floors_event_idx" ON "map_floors" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "map_floors_map_idx" ON "map_floors" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "maps_tenant_idx" ON "maps" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "maps_event_idx" ON "maps" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "booths_tenant_idx" ON "booths" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "booths_event_idx" ON "booths" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "booths_zone_idx" ON "booths" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "booths_floor_idx" ON "booths" USING btree ("map_floor_id");--> statement-breakpoint
CREATE INDEX "booth_assignments_tenant_idx" ON "booth_assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "booth_assignments_event_idx" ON "booth_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "booth_assignments_booth_idx" ON "booth_assignments" USING btree ("booth_id");--> statement-breakpoint
CREATE INDEX "booth_assignments_participation_idx" ON "booth_assignments" USING btree ("participation_id");--> statement-breakpoint
CREATE INDEX "booth_assignments_merchant_idx" ON "booth_assignments" USING btree ("merchant_id");--> statement-breakpoint
ALTER TABLE "event_branding" ADD CONSTRAINT "event_branding_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_branding" ADD CONSTRAINT "event_branding_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;