import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/config/env";

/** Positioning copy from spec §40; the launch package from §41. */
const CAPABILITIES = [
  {
    title: "Event microsite",
    description:
      "A branded, mobile-first public site per event — your logo, your colours, your domain.",
  },
  {
    title: "Merchant directory",
    description:
      "Searchable, filterable listings with photos, menus, dietary tags, and booth numbers.",
  },
  {
    title: "Interactive map",
    description: "Upload a floor plan, plot booths, and let visitors find a stall in seconds.",
  },
  {
    title: "Merchant onboarding",
    description:
      "Invite by CSV, let merchants fill in their own listing, approve submissions in one place.",
  },
  {
    title: "Featured listings",
    description: "Sell homepage placement, category boosts, and map highlights to your merchants.",
  },
  {
    title: "Basic analytics",
    description:
      "Views, searches, favourites, map opens, and QR scans — per event and per merchant.",
  },
];

export default function HomePage() {
  return (
    <>
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <span className="text-lg font-semibold tracking-tight">{env.NEXT_PUBLIC_APP_NAME}</span>
        <nav className="flex items-center gap-2">
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>
            Get started
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <Badge variant="secondary" className="mb-4">
            For event organizers
          </Badge>

          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Launch a complete digital event experience without building your own platform.
          </h1>

          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-base text-pretty sm:text-lg">
            {env.NEXT_PUBLIC_APP_NAME} replaces the spreadsheets, WhatsApp groups, and printed
            directories behind festivals, night markets, expos, and fairs — so your team spends the
            week before the event running the event.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Create your account
            </Link>
            <Link href="/sign-in" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Sign in
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6 sm:pb-28">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability) => (
              <Card key={capability.title}>
                <CardHeader>
                  <CardTitle className="text-base">{capability.title}</CardTitle>
                  <CardDescription>{capability.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6 sm:pb-28">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">One event, one day of setup</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Create the event, upload your branding and floor plan, import your merchant list, send
              the invitations, approve the listings, publish. Share one URL and one QR code.
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="text-muted-foreground border-t px-4 py-6 text-sm sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {env.NEXT_PUBLIC_APP_NAME}
          </span>
          <span>Malaysia-first · Multi-tenant · White-label</span>
        </div>
      </footer>
    </>
  );
}
