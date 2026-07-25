import {
  listCategoriesInUse,
  searchPublicDirectory,
  type DirectoryCard,
  type DirectoryFilters,
} from "@/server/db/repositories/directory.repository";
import { listZonesForEventPublic } from "@/server/db/repositories/zones.repository";
import { publicFileUrl } from "./media.service";

/**
 * The public directory (spec §8.9). Wraps the search repository and resolves logo
 * URLs so pages stay thin. The event has already been resolved to a public one by
 * the caller (`findPublicEvent`), so this only ever runs against a visible event.
 */

export type DirectoryCardView = Omit<DirectoryCard, "logoBucket" | "logoPath"> & {
  logoUrl: string | null;
};

function toView(card: DirectoryCard): DirectoryCardView {
  const { logoBucket, logoPath, ...rest } = card;
  return {
    ...rest,
    logoUrl: logoBucket && logoPath ? publicFileUrl({ bucket: logoBucket, path: logoPath }) : null,
  };
}

export async function searchDirectory(
  eventId: string,
  filters: DirectoryFilters,
): Promise<DirectoryCardView[]> {
  const cards = await searchPublicDirectory(eventId, filters);
  return cards.map(toView);
}

export type DirectoryFacets = {
  categories: { id: string; name: string }[];
  zones: { id: string; name: string; color: string | null }[];
};

export async function getDirectoryFacets(eventId: string): Promise<DirectoryFacets> {
  const [categories, zones] = await Promise.all([
    listCategoriesInUse(eventId),
    listZonesForEventPublic(eventId),
  ]);
  return {
    categories,
    zones: zones.map((z) => ({ id: z.id, name: z.name, color: z.color })),
  };
}
