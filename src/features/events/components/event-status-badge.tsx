import { Badge } from "@/components/ui/badge";
import {
  EVENT_PHASE_LABELS,
  EVENT_STATUS_LABELS,
  type EventPhase,
  type EventStatus,
} from "@/server/events/status";

/**
 * Status badge for the organizer views. Colour tracks how "live to the public"
 * a status is: neutral for drafts/setup, primary for published/live, muted once
 * ended/archived, destructive for cancelled.
 */
const VARIANT: Record<EventStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  setup: "secondary",
  merchant_onboarding: "secondary",
  ready_for_review: "secondary",
  published: "default",
  live: "default",
  ended: "outline",
  archived: "outline",
  cancelled: "destructive",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <Badge variant={VARIANT[status]}>{EVENT_STATUS_LABELS[status]}</Badge>;
}

/** The date-derived phase shown to the public ("Upcoming" / "Live now" / "Ended"). */
export function EventPhaseBadge({ phase }: { phase: EventPhase }) {
  return (
    <Badge variant={phase === "live" ? "default" : "secondary"}>{EVENT_PHASE_LABELS[phase]}</Badge>
  );
}
