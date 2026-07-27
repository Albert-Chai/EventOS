/**
 * The claims / redemptions summary on a voucher row. A Server Component — pure
 * presentation of numbers the page already loaded.
 */
export function ClaimStat({
  claims,
  redemptions,
  totalQuantity,
}: {
  claims: number;
  redemptions: number;
  totalQuantity: number | null;
}) {
  const pct = claims > 0 ? Math.round((redemptions / claims) * 100) : 0;

  return (
    <div className="text-right text-sm">
      <p className="font-medium tabular-nums">
        {claims}
        {totalQuantity !== null ? ` / ${totalQuantity}` : ""} claimed
      </p>
      <p className="text-muted-foreground tabular-nums">
        {redemptions} redeemed{claims > 0 ? ` · ${pct}%` : ""}
      </p>
    </div>
  );
}
