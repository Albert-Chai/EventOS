import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Field wrapper for the Server Action forms.
 *
 * Deliberately not the shadcn `<Form>` component: that binds to React Hook
 * Form's client-side submit, which would break progressive enhancement on the
 * auth pages. Phase 2's large merchant/event forms use RHF and will add it.
 */
export function FormField({
  name,
  label,
  errors,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = Boolean(errors?.length);

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={cn(hasError && errorId, hint && hintId) || undefined}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
