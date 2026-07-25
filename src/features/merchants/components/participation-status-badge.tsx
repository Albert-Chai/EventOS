import { Badge } from "@/components/ui/badge";
import { PARTICIPATION_STATUS_LABELS, type ParticipationStatus } from "@/server/merchants/status";

const VARIANT: Record<ParticipationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  changes_requested: "secondary",
  approved: "default",
  rejected: "destructive",
  withdrawn: "outline",
};

export function ParticipationStatusBadge({ status }: { status: ParticipationStatus }) {
  return <Badge variant={VARIANT[status]}>{PARTICIPATION_STATUS_LABELS[status]}</Badge>;
}
