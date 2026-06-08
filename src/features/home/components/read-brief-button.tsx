"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";

type ReadBriefButtonProps = {
  summary: string;
};

export function ReadBriefButton({ summary }: ReadBriefButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const toggleSpeech = () => {
    if (isSpeaking && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch("/api/brief-audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: summary,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Oplæsning kunne ikke startes.");
        }

        const blob = await response.blob();

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audioRef.current = audio;
        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => setIsSpeaking(false);
        audio.onpause = () => setIsSpeaking(false);
        audio.onerror = () => {
          setIsSpeaking(false);
          setError("AI-oplæsningen kunne ikke afspilles.");
        };

        await audio.play();
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "AI-oplæsningen fejlede.",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={isLoading}
        onClick={toggleSpeech}
        className="rounded-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white disabled:opacity-50"
      >
        {isSpeaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        {isLoading ? "Forbereder stemme..." : isSpeaking ? "Stop oplæsning" : "Læs brief højt"}
      </Button>
      <p className="text-xs leading-6 text-white/45">
        Oplæsningen bruger en AI-genereret stemme.
      </p>
      {error ? <p className="text-xs leading-6 text-[#ffb4b4]">{error}</p> : null}
    </div>
  );
}
