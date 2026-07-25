import { Badge } from "@/components/ui/badge";
import { BOOTH_STATUS_LABELS, type BoothStatus } from "@/server/booths/status";

const VARIANT: Record<BoothStatus, "default" | "secondary" | "destructive" | "outline"> = {
  available: "outline",
  reserved: "secondary",
  assigned: "secondary",
  confirmed: "default",
  blocked: "destructive",
  cancelled: "outline",
};

export function BoothStatusBadge({ status }: { status: BoothStatus }) {
  return <Badge variant={VARIANT[status]}>{BOOTH_STATUS_LABELS[status]}</Badge>;
}
