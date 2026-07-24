"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { magicLinkAction, signInAction } from "../actions";
import { initialAuthFormState } from "../form-state";
import { FormMessage } from "./form-message";

export function SignInForm({ next }: { next: string }) {
  const [passwordState, passwordSubmit] = useActionState(signInAction, initialAuthFormState);
  const [linkState, linkSubmit] = useActionState(magicLinkAction, initialAuthFormState);

  return (
    <Tabs defaultValue="password">
      <TabsList className="w-full">
        <TabsTrigger value="password" className="flex-1">
          Password
        </TabsTrigger>
        <TabsTrigger value="magic-link" className="flex-1">
          Email link
        </TabsTrigger>
      </TabsList>

      <TabsContent value="password">
        <form action={passwordSubmit} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <FormMessage state={passwordState} />

          <FormField
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            errors={passwordState.fieldErrors?.email}
          />

          <div className="grid gap-2">
            <FormField
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              errors={passwordState.fieldErrors?.password}
            />
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground justify-self-end text-xs underline underline-offset-4"
            >
              Forgot your password?
            </Link>
          </div>

          <SubmitButton className="w-full" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </form>
      </TabsContent>

      <TabsContent value="magic-link">
        <form action={linkSubmit} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <FormMessage state={linkState} />

          <FormField
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            hint="We'll email you a link that signs you in — no password needed."
            errors={linkState.fieldErrors?.email}
          />

          <SubmitButton className="w-full" pendingText="Sending…">
            Email me a link
          </SubmitButton>
        </form>
      </TabsContent>
    </Tabs>
  );
}
