/**
 * Drizzle schema barrel.
 *
 * Phase 0: profiles.
 * Phase 1: the multi-tenant core — tenants, membership, roles, platform admins,
 * audit logs, impersonation. Every tenant-scoped table here carries `tenant_id`
 * (spec §5) and is reachable only through the repository layer.
 * Phase 2: events and their satellites — settings, branding, operating hours.
 * Phase 3: merchants — the merchant axis, participations, and listing items.
 * Phase 4: media (`files`) and the floor plan — zones, maps, map_floors, booths,
 * booth_assignments. The reserved `*_file_id` columns now reference `files`.
 * Phase 5: the visitor — visitors (anonymous, cookie-backed), favourites, recent
 * views. Not tenant-scoped by membership; favourites/recent carry tenant + event.
 * Phase 6: monetization — plans (the platform catalog, not tenant-scoped),
 * subscriptions, invoices, usage_records (append-only ledger), featured_placements.
 * Phase 7: analytics — analytics_events (append-only raw log), daily_event_metrics
 * + daily_merchant_metrics (rollups), qr_codes + qr_scan_events (trackable QR).
 */
export * from "./profiles";
export * from "./tenants";
export * from "./roles";
export * from "./members";
export * from "./platform";
export * from "./audit";
export * from "./impersonation";
export * from "./files";
export * from "./events";
export * from "./event-settings";
export * from "./event-branding";
export * from "./event-operating-hours";
export * from "./merchant-categories";
export * from "./merchants";
export * from "./participations";
export * from "./listing-items";
export * from "./zones";
export * from "./maps";
export * from "./booths";
export * from "./booth-assignments";
export * from "./visitors";
export * from "./visitor-favourites";
export * from "./visitor-recent-views";
export * from "./plans";
export * from "./subscriptions";
export * from "./invoices";
export * from "./usage-records";
export * from "./featured-placements";
export * from "./analytics-events";
export * from "./daily-event-metrics";
export * from "./daily-merchant-metrics";
export * from "./qr-codes";
export * from "./qr-scan-events";
