import { CheckCircle2, Circle, Clock } from "lucide-react";

/**
 * Event setup checklist (spec §19). Phase 2 owns the first rows; the rows for
 * later phases (zones, maps, booths, merchants) are shown as upcoming so the
 * organizer sees the whole journey, not a truncated one.
 */
export type ChecklistItem = { label: string; done: boolean; upcoming?: boolean };

export function EventChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="grid gap-2 text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.upcoming ? (
            <Clock className="text-muted-foreground size-4 shrink-0" aria-hidden />
          ) : item.done ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <Circle className="text-muted-foreground size-4 shrink-0" aria-hidden />
          )}
          <span
            className={
              item.upcoming ? "text-muted-foreground" : item.done ? "" : "text-muted-foreground"
            }
          >
            {item.label}
            {item.upcoming ? " — a later phase" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
