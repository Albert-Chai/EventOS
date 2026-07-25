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
