import { Badge } from "@/components/ui/badge";
import { VOUCHER_STATUS_LABELS, type VoucherStatus } from "@/server/vouchers/status";

const VARIANT: Record<VoucherStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  scheduled: "secondary",
  active: "default",
  paused: "secondary",
  expired: "destructive",
  archived: "outline",
};

export function VoucherStatusBadge({ status }: { status: VoucherStatus }) {
  return <Badge variant={VARIANT[status]}>{VOUCHER_STATUS_LABELS[status]}</Badge>;
}
