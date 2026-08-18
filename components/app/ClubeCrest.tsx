"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

// Small club crest with graceful fallback to an initials chip.
export function ClubeCrest({
  src,
  name,
  size = 22,
  className,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded bg-surface-hover text-[9px] font-bold text-muted",
          className
        )}
        style={{ width: size, height: size }}
        title={name}
      >
        {name.slice(0, 3).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
