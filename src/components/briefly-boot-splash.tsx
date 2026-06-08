"use client";

import { useEffect, useState } from "react";

import { BrieflyLoadingScreen } from "@/components/briefly-loading-screen";

export function BrieflyBootSplash() {
  const [phase, setPhase] = useState<"visible" | "fading" | "hidden">("visible");

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setPhase("fading");
    }, 450);
    const hideTimer = window.setTimeout(() => {
      setPhase("hidden");
    }, 950);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[120] transition-all duration-500 ease-out ${
        phase === "fading"
          ? "translate-y-2 opacity-0 blur-sm"
          : "translate-y-0 opacity-100 blur-0"
      }`}
    >
      <BrieflyLoadingScreen splash />
    </div>
  );
}
