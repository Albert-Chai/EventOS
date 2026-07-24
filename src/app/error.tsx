"use client";

import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Global error boundary (spec §18: "error recovery").
 *
 * Next strips the message in production and gives us a `digest` instead — the
 * correlation key back to the server log. Showing it lets a user quote
 * something actionable to support without exposing the underlying error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("client.unhandled_error", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="grid max-w-md gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          We&apos;ve logged the problem. Try again, and if it keeps happening let us know.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">Reference: {error.digest}</p>
        ) : null}
        <div className="flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          {/* A plain anchor, not next/link: this boundary can catch a router
              error, and a hard navigation is the reliable escape hatch. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={buttonVariants({ variant: "outline" })}>
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
