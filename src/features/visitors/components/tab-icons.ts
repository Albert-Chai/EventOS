import { Camera, Heart, Home, Map as MapIcon, Store, Ticket, type LucideIcon } from "lucide-react";

import type { VisitorTabKey } from "../nav-tabs";

/**
 * Tab key → icon. Split from `nav-tabs.ts` so that module stays free of React
 * imports and can be unit-tested on its own.
 */
export const TAB_ICONS: Record<VisitorTabKey, LucideIcon> = {
  home: Home,
  stalls: Store,
  map: MapIcon,
  moments: Camera,
  vouchers: Ticket,
  saved: Heart,
};
