"use client";

import { useState } from "react";

// Renders a federation crest from /public/crests/fed-<slug>.webp when present,
// gracefully falling back to a text badge until the real .webp is added.
export function FedCrest({ federation, size = 36 }: { federation: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const slug = federation.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-md bg-surface-hover text-[10px] font-bold text-muted"
        style={{ width: size, height: size }}
      >
        {federation}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/crests/fed-${slug}.webp`}
      alt={federation}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 object-contain"
    />
  );
}
