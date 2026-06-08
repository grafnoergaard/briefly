import type { ReactNode } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { navigationItems } from "@/features/navigation/data/navigation";
import { cn } from "@/lib/utils";

type AppFrameProps = {
  children: ReactNode;
  currentPath: string;
  userLabel?: string | null;
};

export function AppFrame({ children, currentPath, userLabel }: AppFrameProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(32,89,73,0.08),transparent_32%),linear-gradient(180deg,#fcfcfa_0%,#f5f4ef_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 md:pb-8 lg:px-8">
        <header className="sticky top-0 z-20 mb-6 rounded-[28px] border border-white/70 bg-white/75 px-4 py-3 shadow-[0_24px_60px_-40px_rgba(17,24,39,0.45)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Briefly
              </p>
              <h1 className="text-base font-semibold tracking-[-0.03em] text-foreground sm:text-lg">
                Hvad betyder noget i dag?
              </h1>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              {userLabel ? (
                <span className="max-w-[11rem] truncate rounded-full bg-muted px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:max-w-none">
                  {userLabel}
                </span>
              ) : null}
              <Button variant="outline" size="icon-sm" className="rounded-full bg-white/80">
                <Bell className="size-4" />
              </Button>
              <div className="hidden md:block">
                <SignOutButton />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-30 w-full px-2 pb-2 xl:hidden sm:px-3 sm:pb-3">
          <div className="mx-auto w-full max-w-3xl border border-black/5 bg-[#101313] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] backdrop-blur sm:rounded-[28px] sm:px-3">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${navigationItems.length}, minmax(0, 1fr))` }}
            >
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPath === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-2 text-[10px] font-medium transition-colors sm:px-3 sm:text-[11px]",
                      isActive ? "bg-white text-[#101313]" : "text-white/70 hover:text-white",
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        <aside className="mt-8 hidden xl:block">
          <div
            className="grid gap-3 rounded-[32px] border border-black/5 bg-white/80 p-2 shadow-[0_24px_60px_-40px_rgba(17,24,39,0.4)]"
            style={{ gridTemplateColumns: `repeat(${navigationItems.length}, minmax(0, 1fr))` }}
          >
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-[24px] px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#153d32] text-white"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
