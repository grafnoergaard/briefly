"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-full bg-white/80"
      onClick={handleSignOut}
    >
      <LogOut className="size-4" />
      Log ud
    </Button>
  );
}
