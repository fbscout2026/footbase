"use client";

import Link from "next/link";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UniversalSearch } from "@/components/app/UniversalSearch";
import { ProfileMenu } from "@/components/app/ProfileMenu";
import type { Role } from "@/lib/auth/session";

// Transfermarkt/Wyscout-style top bar on a vivid→dark green gradient: italic
// wordmark (left), prominent white universal search (center), toggles + profile
// menu (right, sitting on the darker end of the gradient).
export function AppHeader({
  fullName,
  email,
  role,
}: {
  fullName: string | null;
  email: string | null;
  role: Role;
}) {
  return (
    <header className="app-header-bg top-header-theme sticky top-0 z-50 shadow-lg">
      <div className="flex h-20 items-center gap-2 px-2 sm:gap-4 sm:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/footbase-logo.svg" alt="Footbase" width="1890" height="277" className="h-auto w-24 sm:w-36 lg:w-48" />
        </Link>

        <div className="hidden flex-1 justify-center md:flex">
          <UniversalSearch />
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <LanguageToggle />
          <ThemeToggle />
          <ProfileMenu fullName={fullName} email={email} role={role} />
        </div>
      </div>

      {/* mobile search row */}
      <div className="px-2 pb-3 sm:px-6 md:hidden">
        <UniversalSearch />
      </div>
    </header>
  );
}
