"use client";

import Link from "next/link";
import { ListTodo, Menu, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { cn } from "@/lib/utils";

type MoreMenuProps = {
  currentPath: string;
  compact?: boolean;
};

const secondaryNavigationItems = [
  { href: "/tasks", label: "Lister", icon: ListTodo, description: "To-do og huskelister" },
  { href: "/settings", label: "Indstillinger", icon: Settings2, description: "AI, sync og stemme" },
] as const;

export function MoreMenu({ currentPath, compact = false }: MoreMenuProps) {
  const isActive = secondaryNavigationItems.some((item) => currentPath === item.href);

  return (
    <Sheet>
      <SheetTrigger asChild>
        {compact ? (
          <button
            type="button"
            className={cn(
              "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-2 text-[10px] font-medium transition-colors sm:px-3 sm:text-[11px]",
              isActive ? "bg-white text-[#101313]" : "text-white/70 hover:text-white",
            )}
          >
            <Menu className="size-4" />
            <span>Mere</span>
          </button>
        ) : (
          <Button
            variant={isActive ? "default" : "outline"}
            className={cn(
              "rounded-full",
              isActive
                ? "bg-[#153d32] text-white hover:bg-[#153d32]/90"
                : "border-black/10 bg-white/80 hover:bg-white",
            )}
          >
            <Menu className="size-4" />
            Mere
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="rounded-t-[32px] border-x-0 border-t border-black/10 bg-[#f7f6f1] p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="border-b border-black/5 px-5 pt-5">
          <SheetTitle>Mere i Briefly</SheetTitle>
          <SheetDescription>
            Her finder du lister, indstillinger og konto.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 p-5">
          {secondaryNavigationItems.map((item) => {
            const Icon = item.icon;
            const active = currentPath === item.href;

            return (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-[24px] border px-4 py-4 transition-colors",
                    active
                      ? "border-[#3C5C4E]/15 bg-[#3C5C4E]/8"
                      : "border-black/5 bg-white/80",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#3C5C4E]/10 text-[#3C5C4E]">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </Link>
              </SheetClose>
            );
          })}

          <div className="rounded-[24px] border border-black/5 bg-white/80 p-2">
            <SignOutButton />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
