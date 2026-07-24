import Link from "next/link";

import { env } from "@/config/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="p-4 sm:p-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {env.NEXT_PUBLIC_APP_NAME}
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 sm:items-center sm:pb-24">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
