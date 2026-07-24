import { Alert, AlertDescription } from "@/components/ui/alert";

import type { AuthFormState } from "../form-state";

/** Renders the non-field-level result of an auth action. */
export function FormMessage({ state }: { state: AuthFormState }) {
  if (state.status === "idle" || !state.message) return null;

  return (
    <Alert
      variant={state.status === "error" ? "destructive" : "default"}
      role={state.status === "error" ? "alert" : "status"}
    >
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
