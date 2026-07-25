"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { inviteMemberAction } from "../actions";
import { initialTeamActionState } from "../state";
import type { RoleOption } from "./role-options";

/**
 * Invite-by-email form. On success it surfaces the invitation link for the
 * admin to share — Phase 1 has no transactional email, so we don't pretend to
 * have sent one.
 */
export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const [state, submit] = useActionState(inviteMemberAction, initialTeamActionState);

  return (
    <form action={submit} className="grid gap-4">
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "success" ? (
        <Alert role="status">
          <AlertDescription className="grid gap-2">
            <span>{state.message}</span>
            {state.inviteUrl ? (
              <code className="bg-muted block overflow-x-auto rounded px-2 py-1.5 text-xs">
                {state.inviteUrl}
              </code>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <FormField
        name="email"
        label="Email address"
        type="email"
        autoComplete="off"
        required
        placeholder="teammate@example.com"
      />

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Roles</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {roles.map((role) => (
            <label key={role.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="roleKeys"
                value={role.key}
                defaultChecked={role.key === "event_manager"}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{role.name}</span>
                <span className="text-muted-foreground block text-xs">{role.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <SubmitButton className="justify-self-start" pendingText="Creating…">
        Create invitation
      </SubmitButton>
    </form>
  );
}
