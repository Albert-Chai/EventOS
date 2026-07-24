import { googleSignInAction } from "../actions";
import { SubmitButton } from "@/components/forms/submit-button";
import { Separator } from "@/components/ui/separator";

/**
 * Renders only when AUTH_GOOGLE_ENABLED is true, so we never show a button that
 * leads to a Supabase "provider not enabled" error (plan §4, question 2).
 */
export function GoogleButton({ enabled, next }: { enabled: boolean; next: string }) {
  if (!enabled) return null;

  return (
    <>
      <div className="relative">
        <Separator />
        <span className="bg-card text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-xs uppercase">
          or
        </span>
      </div>

      <form action={googleSignInAction}>
        <input type="hidden" name="next" value={next} />
        <SubmitButton variant="outline" className="w-full" pendingText="Redirecting…">
          Continue with Google
        </SubmitButton>
      </form>
    </>
  );
}
