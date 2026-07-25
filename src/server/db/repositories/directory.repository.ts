import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { db } from "@/server/db";
import { merchantCategories, merchantEventParticipations, merchants } from "@/server/db/schema";

/**
 * The public merchant directory search (spec §8.9). One parameterized query over
 * an event's public set (approved participation, active merchant) with Postgres
 * full-text ranking and the MVP filters. Interpolations are parameterized by
 * Drizzle's `sql` tag, so user input never reaches the query as raw text.
 *
 * FTS is un-indexed here: a seq scan over one event's approved merchants is cheap
 * at MVP scale. If an event grows large, a stored `tsvector` + GIN is the upgrade.
 */

export type DirectorySort = "relevance" | "name";

export type DirectoryFilters = {
  query?: string;
  categoryId?: string;
  zoneId?: string;
  halal?: boolean;
  /** A dietary tag to require on some item (e.g. "vegetarian"). */
  diet?: string;
  priceMin?: number;
  priceMax?: number;
  promoOnly?: boolean;
};

export type DirectoryCard = {
  participationId: string;
  merchantId: string;
  merchantSlug: string;
  merchantName: string;
  listingTitle: string | null;
  listingDescription: string | null;
  categoryName: string | null;
  logoBucket: string | null;
  logoPath: string | null;
  boothNumber: string | null;
  zoneName: string | null;
  hasHalal: boolean;
  hasPromo: boolean;
  minPrice: string | null;
  currency: string | null;
};

type Row = {
  participation_id: string;
  merchant_id: string;
  merchant_slug: string;
  merchant_name: string;
  listing_title: string | null;
  listing_description: string | null;
  category_name: string | null;
  logo_bucket: string | null;
  logo_path: string | null;
  booth_number: string | null;
  zone_name: string | null;
  has_halal: boolean | null;
  has_promo: boolean | null;
  min_price: string | null;
  currency: string | null;
};

export async function searchPublicDirectory(
  eventId: string,
  filters: DirectoryFilters,
): Promise<DirectoryCard[]> {
  const conditions: SQL[] = [
    sql`p.event_id = ${eventId}`,
    sql`p.approval_status = 'approved'`,
  ];

  // The searchable document: merchant + listing + category + items + booth + zone.
  const documentExpr = sql`to_tsvector('simple',
    coalesce(m.name,'') || ' ' || coalesce(p.listing_title,'') || ' ' ||
    coalesce(p.listing_description,'') || ' ' || coalesce(c.name,'') || ' ' ||
    coalesce(fct.item_text,'') || ' ' || coalesce(z.booth_number,'') || ' ' ||
    coalesce(z.zone_name,''))`;

  const query = filters.query?.trim();
  let rankExpr = sql`0::real`;
  if (query) {
    const q = sql`websearch_to_tsquery('simple', ${query})`;
    conditions.push(sql`${documentExpr} @@ ${q}`);
    rankExpr = sql`ts_rank(${documentExpr}, ${q})`;
  }

  if (filters.categoryId) conditions.push(sql`m.category_id = ${filters.categoryId}`);
  if (filters.zoneId) conditions.push(sql`z.zone_id = ${filters.zoneId}`);
  if (filters.halal) conditions.push(sql`fct.has_halal`);
  if (filters.diet) {
    conditions.push(
      sql`exists (select 1 from listing_items li where li.participation_id = p.id and ${filters.diet.toLowerCase()} = any(select lower(t) from unnest(li.dietary_tags) t))`,
    );
  }
  if (filters.priceMax != null) conditions.push(sql`fct.min_price <= ${filters.priceMax}`);
  if (filters.priceMin != null) conditions.push(sql`fct.max_price >= ${filters.priceMin}`);
  if (filters.promoOnly) conditions.push(sql`fct.has_promo`);

  const orderExpr = query
    ? sql`rank desc, p.featured_rank asc nulls last, lower(m.name) asc`
    : sql`p.featured_rank asc nulls last, lower(m.name) asc`;

  const rows = await db.execute<Row>(sql`
    with item_facts as (
      select participation_id,
        bool_or(is_halal) as has_halal,
        min(price) as min_price,
        max(coalesce(promo_price, price)) as max_price,
        bool_or(promo_price is not null) as has_promo,
        (array_agg(currency order by price asc nulls last))[1] as currency,
        string_agg(coalesce(name,'') || ' ' || coalesce(description,'') || ' ' ||
                   array_to_string(dietary_tags, ' '), ' ') as item_text
      from listing_items
      group by participation_id
    )
    select
      p.id as participation_id,
      m.id as merchant_id, m.slug as merchant_slug, m.name as merchant_name,
      p.listing_title, p.listing_description,
      c.name as category_name,
      f.bucket as logo_bucket, f.path as logo_path,
      fct.has_halal, fct.has_promo, fct.min_price, fct.currency,
      z.zone_name, z.booth_number,
      ${rankExpr} as rank
    from merchant_event_participations p
    join merchants m on m.id = p.merchant_id and m.status = 'active' and m.deleted_at is null
    left join merchant_categories c on c.id = m.category_id
    left join files f on f.id = m.logo_file_id
    left join item_facts fct on fct.participation_id = p.id
    left join lateral (
      select b.booth_number, zz.id as zone_id, zz.name as zone_name
      from booth_assignments ba
      join booths b on b.id = ba.booth_id
      left join zones zz on zz.id = b.zone_id
      where ba.participation_id = p.id and ba.status <> 'cancelled'
      limit 1
    ) z on true
    where ${sql.join(conditions, sql` and `)}
    order by ${orderExpr}
  `);

  return rows.map((r) => ({
    participationId: r.participation_id,
    merchantId: r.merchant_id,
    merchantSlug: r.merchant_slug,
    merchantName: r.merchant_name,
    listingTitle: r.listing_title,
    listingDescription: r.listing_description,
    categoryName: r.category_name,
    logoBucket: r.logo_bucket,
    logoPath: r.logo_path,
    boothNumber: r.booth_number,
    zoneName: r.zone_name,
    hasHalal: r.has_halal ?? false,
    hasPromo: r.has_promo ?? false,
    minPrice: r.min_price,
    currency: r.currency,
  }));
}

/** Categories in use by an event's approved, active merchants — for filter chips. */
export async function listCategoriesInUse(
  eventId: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .selectDistinct({ id: merchantCategories.id, name: merchantCategories.name })
    .from(merchantEventParticipations)
    .innerJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .innerJoin(merchantCategories, eq(merchantCategories.id, merchants.categoryId))
    .where(
      and(
        eq(merchantEventParticipations.eventId, eventId),
        eq(merchantEventParticipations.approvalStatus, "approved"),
        eq(merchants.status, "active"),
        isNull(merchants.deletedAt),
      ),
    )
    .orderBy(asc(merchantCategories.name));
}
