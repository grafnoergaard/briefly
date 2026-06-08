import type { ReactNode } from "react";
import Link from "next/link";
import { MoreMenu } from "@/features/navigation/components/more-menu";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { primaryNavigationItems } from "@/features/navigation/data/navigation";
import { cn } from "@/lib/utils";

type AppFrameProps = {
  children: ReactNode;
  currentPath: string;
  userLabel?: string | null;
};

export function AppFrame({ children, currentPath, userLabel }: AppFrameProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(32,89,73,0.08),transparent_32%),linear-gradient(180deg,#fcfcfa_0%,#f5f4ef_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 pb-[calc(8.75rem+env(safe-area-inset-bottom))] pt-[max(1.15rem,env(safe-area-inset-top))] sm:px-6 md:pb-10 lg:px-8">
        <header className="sticky top-[max(0.9rem,env(safe-area-inset-top))] z-20 mb-4 rounded-[26px] border border-white/75 bg-white/82 px-4 py-3 shadow-[0_24px_60px_-40px_rgba(17,24,39,0.45)] backdrop-blur-xl sm:mb-6 sm:rounded-[28px]">
          <div className="flex items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground/90">
                Briefly
              </p>
              <h1 className="pr-2 pt-1 text-[17px] font-semibold tracking-[-0.05em] text-foreground sm:text-lg">
                Hvad betyder noget i dag?
              </h1>
            </div>
            <div className="hidden items-center justify-end gap-2 md:flex">
              {userLabel ? (
                <span className="max-w-[11rem] truncate rounded-full bg-muted px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground md:inline-flex md:max-w-none">
                  {userLabel}
                </span>
              ) : null}
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-30 w-full px-2 pb-[max(0.8rem,env(safe-area-inset-bottom))] xl:hidden sm:px-3 sm:pb-[max(0.95rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-3xl rounded-[30px] border border-black/5 bg-[#101313]/98 px-2 pt-2 text-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)] backdrop-blur sm:px-3">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${primaryNavigationItems.length + 1}, minmax(0, 1fr))` }}
            >
              {primaryNavigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPath === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-2 text-[10px] font-medium transition-colors sm:px-3 sm:text-[11px]",
                      isActive ? "bg-white text-[#101313]" : "text-white/70 hover:text-white",
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <MoreMenu currentPath={currentPath} compact />
            </div>
          </div>
        </nav>

        <aside className="mt-8 hidden xl:block">
          <div
            className="grid gap-3 rounded-[32px] border border-black/5 bg-white/80 p-2 shadow-[0_24px_60px_-40px_rgba(17,24,39,0.4)]"
            style={{ gridTemplateColumns: `repeat(${primaryNavigationItems.length + 1}, minmax(0, 1fr))` }}
          >
            {primaryNavigationItems.map((item) => {
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
            <div className="flex items-center justify-center">
              <MoreMenu currentPath={currentPath} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
