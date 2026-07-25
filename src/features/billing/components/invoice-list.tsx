import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPlanPrice } from "@/server/billing/plans";
import type { Invoice } from "@/server/db/schema";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  paid: "default",
  open: "secondary",
  draft: "outline",
  void: "outline",
};

export function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return <p className="text-muted-foreground text-sm">No invoices yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Number</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-mono text-xs">{invoice.number}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {invoice.issuedAt.toLocaleDateString()}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatPlanPrice(invoice.amountCents, invoice.currency)}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[invoice.status] ?? "outline"}>{invoice.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
