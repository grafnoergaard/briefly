"use client";

import { useState, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";

type ReadBriefButtonProps = {
  summary: string;
};

export function ReadBriefButton({ summary }: ReadBriefButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const speechSynthesisSupported =
    hasMounted &&
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined";

  const toggleSpeech = () => {
    if (!speechSynthesisSupported) {
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(summary);
    utterance.lang = "da-DK";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={!speechSynthesisSupported}
      onClick={toggleSpeech}
      className="rounded-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white disabled:opacity-50"
    >
      {isSpeaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      {isSpeaking ? "Stop oplæsning" : "Læs brief højt"}
    </Button>
  );
}
