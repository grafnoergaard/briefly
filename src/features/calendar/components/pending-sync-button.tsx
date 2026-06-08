"use client";

import { RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type PendingSyncButtonProps = {
  label?: string;
};

export function PendingSyncButton({
  label = "Sync Google Kalender",
}: PendingSyncButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="rounded-full bg-[#153d32] hover:bg-[#205949]"
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      {label}
    </Button>
  );
}
