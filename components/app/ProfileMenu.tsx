"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { Role } from "@/lib/auth/session";

export function ProfileMenu({
  fullName,
  email,
  role,
}: {
  fullName: string | null;
  email: string | null;
  role: Role;
}) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = (fullName?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={fullName ?? "perfil"}
        aria-expanded={open}
        aria-haspopup="menu"
        className="header-control flex h-11 w-11 items-center justify-center rounded-full text-sm font-extrabold text-brand transition-colors"
      >
        {initial}
      </button>

      {open && (
        <div className="header-menu absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-sm border shadow-xl">
          <div className="border-b border-white/15 px-4 py-3">
            <p className="truncate text-sm font-semibold text-white">
              {fullName ?? "—"}
            </p>
            {email && <p className="truncate text-xs text-white/60">{email}</p>}
            <span className="mt-1.5 inline-block rounded-sm bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
              {t(`role.${role}` as TranslationKey)}
            </span>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-white transition-colors hover:bg-white/10"
          >
            <LogOut size={15} />
            {t("common.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
