"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";

type ReadBriefButtonProps = {
  summary: string;
};

const BRIEFLY_PLAYBACK_GAIN = 1.85;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export function ReadBriefButton({ summary }: ReadBriefButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch {}
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }

      audioRef.current?.pause();

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const ensureAudioContext = async () => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextConstructor();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    if (!gainNodeRef.current) {
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = BRIEFLY_PLAYBACK_GAIN;
      gainNodeRef.current.connect(audioContextRef.current.destination);
    }

    return audioContextRef.current;
  };

  const unlockAudioOutput = async () => {
    const context = await ensureAudioContext();

    if (!context) {
      return;
    }

    const buffer = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNodeRef.current ?? context.destination);
    source.start(0);
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {}
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    setIsSpeaking(false);
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopAudio();
      return;
    }

    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        await unlockAudioOutput();

        const response = await fetch("/api/brief-audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: summary,
            mode: "brief",
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Oplæsning kunne ikke startes.");
        }

        const audioBuffer = await response.arrayBuffer();
        const context = await ensureAudioContext();

        if (context) {
          const decoded = await context.decodeAudioData(audioBuffer.slice(0));
          setIsSpeaking(true);

          await new Promise<void>((resolve, reject) => {
            const source = context.createBufferSource();
            audioSourceRef.current = source;
            source.buffer = decoded;
            source.connect(gainNodeRef.current ?? context.destination);
            source.onended = () => {
              audioSourceRef.current = null;
              setIsSpeaking(false);
              resolve();
            };

            try {
              source.start(0);
            } catch {
              reject(new Error("AI-oplæsningen kunne ikke afspilles."));
            }
          });
        } else {
          const blob = new Blob([audioBuffer], { type: "audio/mpeg" });

          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }

          const objectUrl = URL.createObjectURL(blob);
          objectUrlRef.current = objectUrl;

          const audio = new Audio(objectUrl);
          audio.preload = "auto";
          audio.setAttribute("playsinline", "true");
          audio.volume = 1;
          audioRef.current = audio;
          audio.onplay = () => setIsSpeaking(true);
          audio.onended = () => setIsSpeaking(false);
          audio.onpause = () => setIsSpeaking(false);
          audio.onerror = () => {
            setIsSpeaking(false);
            setError("AI-oplæsningen kunne ikke afspilles.");
          };

          await audio.play();
        }
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
