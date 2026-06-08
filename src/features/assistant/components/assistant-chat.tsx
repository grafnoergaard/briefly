"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Loader2, Mic, Sparkles, User2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  meta?: string | null;
  isError?: boolean;
};

type AssistantHistoryMessage = {
  role: "assistant" | "user";
  content: string;
};

type AssistantApiPayload = {
  reply?: string;
  action?: string;
  createdEvent?: {
    title: string;
    calendarName: string;
    timeLabel: string;
  } | null;
  completedActions?: string[];
  error?: string;
};

type SubmitMessageOptions = {
  speakReply?: boolean;
  channel?: "text" | "voice";
};

type AssistantChatProps = {
  variant?: "embedded" | "page";
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    webkitAudioContext?: typeof AudioContext;
  }
}

export function AssistantChat({ variant = "page" }: AssistantChatProps) {
  const LISTENING_PAUSE_MS = 1800;
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Skriv naturligt til mig, så kan jeg omsætte det til handlinger. Prøv fx: “Jeg skal køre cykelløb i morgen kl. 11”.",
      meta: variant === "embedded" ? "Klar" : "Kalender, lister, indkøb og madplan",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [isRealtimePending, setIsRealtimePending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const finalTranscriptRef = useRef("");
  const listeningCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldCommitTranscriptRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const voiceConversationActiveRef = useRef(false);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const canSubmit = draft.trim().length > 0 && !isPending;
  const visibleMessages =
    variant === "embedded"
      ? messages.length > 1
        ? messages.slice(-2)
        : []
      : messages;
  const speechRecognitionSupported =
    hasMounted &&
    typeof window !== "undefined" &&
    (typeof window.SpeechRecognition !== "undefined" ||
      typeof window.webkitSpeechRecognition !== "undefined");
  const realtimeVoiceSupported =
    hasMounted &&
    speechRecognitionSupported;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    voiceConversationActiveRef.current = isRealtimeActive;
  }, [isRealtimeActive]);

  const buildAssistantHistory = useCallback((source: ChatMessage[]) => {
    return source
      .filter(
        (item) =>
          (item.role === "assistant" || item.role === "user") &&
          item.meta !== "Arbejder" &&
          !item.isError,
      )
      .map((item) => ({
        role: item.role,
        content: item.content,
      }))
      .slice(-16);
  }, []);

  const buildVisualConfirmation = useCallback((payload: AssistantApiPayload) => {
    const actions = payload.completedActions ?? [];

    if (actions.length === 0) {
      return null;
    }

    return actions
      .map((action) => {
        const segments = action.split("·").map((segment) => segment.trim());
        const [kind, first, second, third] = segments;

        if (kind === "Calendar") {
          return `Opretter aftalen “${first}” i kalenderen${second ? ` (${second})` : ""}.`;
        }

        if (kind === "Kalender" && first === "slettet") {
          return `Sletter aftalen “${second}” i kalenderen${third ? ` (${third})` : ""}.`;
        }

        if (kind === "Task") {
          return `Tilføjer to-do: “${first}”.`;
        }

        if (kind === "Shopping") {
          return `Tilføjer til indkøbslisten: ${first}.`;
        }

        if (kind === "Meal plan") {
          return `Lægger på madplanen: “${first}”${second ? ` (${second})` : ""}.`;
        }

        return action;
      })
      .join(" ");
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {}
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }

    playbackAudioRef.current?.pause();
    playbackAudioRef.current = null;

    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = null;
    }
  }, []);

  const ensureAudioContext = useCallback(async () => {
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

    return audioContextRef.current;
  }, []);

  const unlockAudioOutput = useCallback(async () => {
    const context = await ensureAudioContext();

    if (!context) {
      return;
    }

    const buffer = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  }, [ensureAudioContext]);

  const clearListeningCommitTimeout = useCallback(() => {
    if (listeningCommitTimeoutRef.current) {
      clearTimeout(listeningCommitTimeoutRef.current);
      listeningCommitTimeoutRef.current = null;
    }
  }, []);

  const resetTranscriptState = useCallback(() => {
    transcriptRef.current = "";
    finalTranscriptRef.current = "";
    setDraft("");
  }, []);

  const startListeningCycle = useCallback(() => {
    if (!voiceConversationActiveRef.current || !recognitionRef.current) {
      return;
    }

    clearListeningCommitTimeout();
    shouldCommitTranscriptRef.current = true;
    resetTranscriptState();
    setRealtimeStatus("Briefly åbner mikrofonen…");

    try {
      recognitionRef.current.start();
    } catch {
      setIsListening(true);
      setRealtimeStatus("Briefly lytter. Tal frit.");
    }
  }, [clearListeningCommitTimeout, resetTranscriptState]);

  const speakAssistantReply = useCallback(
    async (text: string) => {
      try {
        stopPlayback();
        setVoiceStatus("Briefly svarer…");

        const response = await fetch("/api/brief-audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            mode: "assistant",
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Briefly kunne ikke læse svaret op.");
        }

        const audioBuffer = await response.arrayBuffer();
        const context = await ensureAudioContext();

        if (context) {
          const decoded = await context.decodeAudioData(audioBuffer.slice(0));

          await new Promise<void>((resolve, reject) => {
            const source = context.createBufferSource();
            audioSourceRef.current = source;
            source.buffer = decoded;
            source.connect(context.destination);
            source.onended = () => {
              audioSourceRef.current = null;
              resolve();
            };

            try {
              source.start(0);
            } catch {
              reject(new Error("Briefly kunne ikke afspille svaret."));
            }
          });
        } else {
          const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
          const objectUrl = URL.createObjectURL(blob);
          playbackUrlRef.current = objectUrl;

          const audio = new Audio(objectUrl);
          audio.preload = "auto";
          audio.setAttribute("playsinline", "true");
          playbackAudioRef.current = audio;

          await new Promise<void>((resolve, reject) => {
            audio.onended = () => {
              resolve();
            };
            audio.onerror = () => {
              reject(new Error("Briefly kunne ikke afspille svaret."));
            };
            void audio.play().catch(reject);
          });
        }
      } catch (error) {
        setVoiceStatus(
          error instanceof Error ? error.message : "Briefly kunne ikke læse svaret op.",
        );
      } finally {
        stopPlayback();
        if (voiceConversationActiveRef.current) {
          setVoiceStatus(null);
          setTimeout(() => {
            startListeningCycle();
          }, 250);
        }
      }
    },
    [ensureAudioContext, startListeningCycle, stopPlayback],
  );

  const submitMessage = useCallback((message: string, options?: SubmitMessageOptions) => {
    const history: AssistantHistoryMessage[] = buildAssistantHistory(messagesRef.current);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    const placeholderId = crypto.randomUUID();

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: placeholderId,
        role: "assistant",
        content: "Briefly tænker…",
        meta: "Arbejder",
      },
    ]);

    startTransition(async () => {
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            channel: options?.channel ?? "text",
            history,
          }),
        });

        const payload = (await response.json()) as AssistantApiPayload | undefined;

        if (!response.ok || payload?.error) {
          throw new Error(payload?.error ?? "Briefly-assistenten fejlede.");
        }

        const visualConfirmation = payload ? buildVisualConfirmation(payload) : null;

        setMessages((current) =>
          current.flatMap((item) => {
            if (item.id !== placeholderId) {
              return [item];
            }

            const assistantReply: ChatMessage = {
              id: placeholderId,
              role: "assistant",
              content: payload?.reply ?? "Det er på plads.",
              meta: payload?.completedActions && payload.completedActions.length > 0
                ? payload.completedActions.join(" | ")
                : payload?.createdEvent
                  ? `Oprettet i ${payload.createdEvent.calendarName} · ${payload.createdEvent.timeLabel}`
                  : payload?.action === "clarify"
                    ? "Behøver afklaring"
                    : "Svar",
            };

            if (!visualConfirmation) {
              return [assistantReply];
            }

            return [
              {
                id: `${placeholderId}-confirm`,
                role: "assistant",
                content: visualConfirmation,
                meta: "Forstået",
              },
              assistantReply,
            ];
          }),
        );

        if (options?.speakReply && payload?.reply) {
          await speakAssistantReply(payload.reply);
        }
      } catch (error) {
        const nextMessage =
          error instanceof Error ? error.message : "Briefly-assistenten fejlede uventet.";

        setMessages((current) =>
          current.map((item) =>
            item.id === placeholderId
              ? {
                  id: placeholderId,
                  role: "assistant",
                  content: nextMessage,
                  meta: "Fejl",
                  isError: true,
                }
              : item,
          ),
        );
      }
    });
  }, [buildAssistantHistory, buildVisualConfirmation, speakAssistantReply]);

  useEffect(() => {
    if (!speechRecognitionSupported || recognitionRef.current) {
      return;
    }

    const SpeechRecognitionConstructor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "da-DK";

    recognition.onstart = () => {
      setIsListening(true);
      setRealtimeStatus("Briefly lytter nu.");
    };

    recognition.onresult = (event) => {
      let nextFinalTranscript = finalTranscriptRef.current;
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const nextTranscript = event.results[index][0].transcript.trim();

        if (!nextTranscript) {
          continue;
        }

        if (event.results[index].isFinal) {
          nextFinalTranscript = `${nextFinalTranscript} ${nextTranscript}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${nextTranscript}`.trim();
        }
      }

      finalTranscriptRef.current = nextFinalTranscript;
      transcriptRef.current = `${nextFinalTranscript} ${interimTranscript}`.trim();
      setDraft(transcriptRef.current);
      setRealtimeStatus(interimTranscript ? "Briefly lytter…" : "Briefly samler din besked…");

      clearListeningCommitTimeout();
      listeningCommitTimeoutRef.current = setTimeout(() => {
        if (!voiceConversationActiveRef.current || !recognitionRef.current) {
          return;
        }

        setRealtimeStatus("Briefly gør sig klar til at svare…");
        recognitionRef.current.stop();
      }, LISTENING_PAUSE_MS);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      clearListeningCommitTimeout();
      setRealtimeStatus(
        event.error === "not-allowed"
          ? "Mikrofonadgang blev ikke givet."
          : "Stemmeinput fejlede. Prøv igen.",
      );
    };

    recognition.onend = () => {
      clearListeningCommitTimeout();
      const finalTranscript = (finalTranscriptRef.current || transcriptRef.current).trim();
      setIsListening(false);

      if (!voiceConversationActiveRef.current) {
        return;
      }

      if (!shouldCommitTranscriptRef.current) {
        resetTranscriptState();
        return;
      }

      if (!finalTranscript) {
        setTimeout(() => {
          startListeningCycle();
        }, 250);
        return;
      }

      resetTranscriptState();
      setRealtimeStatus("Briefly tænker…");
      submitMessage(finalTranscript, { speakReply: true, channel: "voice" });
    };

    recognitionRef.current = recognition;
  }, [clearListeningCommitTimeout, resetTranscriptState, speechRecognitionSupported, startListeningCycle, submitMessage]);

  const stopRealtimeVoice = useCallback(() => {
    voiceConversationActiveRef.current = false;
    shouldCommitTranscriptRef.current = false;
    setIsRealtimeActive(false);
    setIsListening(false);
    setIsRealtimePending(false);
    setRealtimeStatus("Samtalen er afsluttet.");
    clearListeningCommitTimeout();
    recognitionRef.current?.stop();
    resetTranscriptState();
    stopPlayback();
  }, [clearListeningCommitTimeout, resetTranscriptState, stopPlayback]);

  const startRealtimeVoice = useCallback(async () => {
    if (!speechRecognitionSupported || isRealtimePending) {
      setRealtimeStatus("Stemmeinput understøttes ikke i denne browser.");
      return;
    }

    setVoiceStatus(null);
    setIsRealtimePending(true);
    setRealtimeStatus("Starter samtale…");

    try {
      await unlockAudioOutput();
      voiceConversationActiveRef.current = true;
      setIsRealtimeActive(true);
      startListeningCycle();
    } catch (error) {
      voiceConversationActiveRef.current = false;
      setIsRealtimeActive(false);
      setRealtimeStatus(
        error instanceof Error ? error.message : "Kunne ikke starte samtalen.",
      );
    } finally {
      setIsRealtimePending(false);
    }
  }, [isRealtimePending, speechRecognitionSupported, startListeningCycle, unlockAudioOutput]);

  useEffect(() => {
    return () => {
      clearListeningCommitTimeout();
      shouldCommitTranscriptRef.current = false;
      recognitionRef.current?.stop();
      resetTranscriptState();
      stopPlayback();
    };
  }, [clearListeningCommitTimeout, resetTranscriptState, stopPlayback]);

  return (
    <div className="grid gap-4">
      {variant === "page" ? (
        <div className="rounded-[30px] border border-black/5 bg-[#101313] p-5 text-white shadow-[0_24px_60px_-40px_rgba(0,0,0,0.5)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/55">
                Assistent
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
                Tal med Briefly
              </h1>
            </div>
            <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
              Kalender, lister, madplan og indkøb
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72">
            Fortæl Briefly noget i naturligt sprog. Det kan stille et kort opfølgende spørgsmål,
            holde fast i konteksten og derefter hjælpe med kalender, lister, indkøb eller
            madplan. Du kan skrive, trykke på mikrofonen eller tale live.
          </p>
        </div>
      ) : null}

      <div className={variant === "page" ? "grid gap-4 xl:grid-cols-[1.15fr_0.85fr]" : "grid gap-3"}>
        <div
          className={
            variant === "page"
              ? "rounded-[30px] border border-black/5 bg-white/82 p-4 shadow-[0_24px_60px_-40px_rgba(17,24,39,0.45)] sm:p-5"
              : "space-y-4"
          }
        >
          <div className="grid gap-3">
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[88%] rounded-[26px] bg-[#3C5C4E] px-4 py-3 text-sm leading-7 text-white"
                    : message.isError
                      ? "max-w-[92%] rounded-[26px] border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm leading-7 text-red-100"
                      : variant === "embedded"
                        ? "max-w-[92%] rounded-[26px] border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white/84"
                        : "max-w-[92%] rounded-[26px] border border-black/5 bg-[#f5f4ef] px-4 py-3 text-sm leading-7 text-foreground"
                }
              >
                <div
                  className={`mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] ${
                    variant === "embedded" ? "opacity-55" : "opacity-65"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <Sparkles className="size-3.5" />
                  ) : (
                    <User2 className="size-3.5" />
                  )}
                  <span>{message.role === "assistant" ? "Briefly" : "Du"}</span>
                </div>
                <p>{message.content}</p>
                {message.meta ? (
                  <p className="mt-2 text-[11px] uppercase tracking-[0.16em] opacity-55">
                    {message.meta}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <form
            className={
              variant === "embedded"
                ? "rounded-[24px] border border-white/10 bg-white/5 p-2.5 sm:rounded-[28px] sm:p-3"
                : "mt-5 rounded-[28px] border border-black/5 bg-[#f7f7f3] p-3"
            }
            onSubmit={(event) => {
              event.preventDefault();

              const nextMessage = draft.trim();

              if (!nextMessage) {
                return;
              }

              setDraft("");
              submitMessage(nextMessage, { channel: "text" });
            }}
          >
            <label className="block">
              <span className="sr-only">Message Briefly</span>
              <div className="space-y-3">
                <div
                  className={`rounded-[18px] border px-3 py-3 backdrop-blur-sm sm:rounded-[20px] sm:px-4 ${
                    variant === "embedded"
                      ? "border-white/10 bg-white/6"
                      : "border-[#3C5C4E]/10 bg-[#f4f6f2]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex size-11 items-center justify-center">
                      <span
                        className={`absolute inset-0 rounded-full ${
                          isRealtimeActive
                            ? "bg-[#3C5C4E]/20 animate-ping"
                            : "bg-[#3C5C4E]/10"
                        }`}
                      />
                      <span
                        className={`absolute inset-1 rounded-full ${
                          isRealtimeActive
                            ? "bg-[#3C5C4E]/25 animate-pulse"
                            : "bg-[#3C5C4E]/12"
                        }`}
                      />
                      <span
                        className={`relative flex size-7 items-center justify-center rounded-full ${
                          isRealtimeActive
                            ? "bg-[#3C5C4E] text-white shadow-[0_0_30px_rgba(60,92,78,0.35)]"
                            : variant === "embedded"
                              ? "bg-white/12 text-white/80"
                              : "bg-[#3C5C4E]/14 text-[#3C5C4E]"
                        }`}
                      >
                        <Mic className="size-3.5" />
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[11px] uppercase tracking-[0.22em] ${
                            variant === "embedded" ? "text-white/55" : "text-[#3C5C4E]/80"
                          }`}
                        >
                          Briefly voice
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${
                            isListening
                              ? "bg-[#3C5C4E] text-white"
                              : variant === "embedded"
                                ? "bg-white/10 text-white/70"
                                : "bg-[#3C5C4E]/10 text-[#3C5C4E]"
                          }`}
                        >
                          {isListening ? "Lytter nu" : isRealtimeActive ? "Samtale aktiv" : "Klar til samtale"}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-[13px] leading-5 sm:text-sm sm:leading-6 ${
                          variant === "embedded" ? "text-white/70" : "text-foreground/70"
                        }`}
                      >
                        {isRealtimeActive
                          ? "Tal frit. Briefly kan stille ét kort opfølgende spørgsmål og handle bagefter."
                          : "Skriv en besked, eller start en levende samtale med Briefly."}
                      </p>
                    </div>

                    <div className="hidden items-end gap-1 self-stretch sm:flex">
                      {[0, 1, 2, 3].map((index) => (
                        <span
                          key={index}
                        className={`w-1 rounded-full bg-[#3C5C4E] transition-all ${
                            isListening
                              ? index % 2 === 0
                                ? "h-8 animate-pulse opacity-100"
                                : "h-5 animate-bounce opacity-85"
                              : index % 2 === 0
                                ? "h-3 opacity-45"
                                : "h-5 opacity-65"
                          }`}
                          style={
                            isRealtimeActive
                              ? {
                                  animationDelay: `${index * 120}ms`,
                                  animationDuration: `${900 + index * 120}ms`,
                                }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Skriv det du vil have Briefly til at gøre"
                  rows={4}
                  className={
                    variant === "embedded"
                      ? "min-h-36 w-full resize-none rounded-[20px] border border-transparent bg-white/95 px-4 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-white/20 focus:ring-2 focus:ring-white/10 sm:min-h-40 sm:rounded-[22px]"
                      : "min-h-40 w-full resize-none rounded-[22px] border border-transparent bg-white px-4 pb-4 pt-24 text-sm leading-7 text-foreground outline-none transition focus:border-[#3C5C4E] focus:ring-2 focus:ring-[#3C5C4E]/10"
                  }
                />
              </div>
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className={variant === "embedded" ? "text-xs leading-6 text-white/45" : "text-xs leading-6 text-muted-foreground"}>
                  Relative tider som “i morgen kl. 11” tolkes i dansk tid.
                </p>
                {realtimeStatus ? (
                  <p className={variant === "embedded" ? "text-xs leading-6 text-[#8bd1bb]" : "text-xs leading-6 text-[#205949]"}>{realtimeStatus}</p>
                ) : voiceStatus ? (
                  <p className={variant === "embedded" ? "text-xs leading-6 text-[#8bd1bb]" : "text-xs leading-6 text-[#205949]"}>{voiceStatus}</p>
                ) : isRealtimeActive ? (
                  <p className={variant === "embedded" ? "text-xs leading-6 text-white/45" : "text-xs leading-6 text-muted-foreground"}>
                    Tal frit til Briefly. Du kan svare kort som “ja”, “nej”, “flyt den til klokken 19” eller “slet den”.
                  </p>
                ) : (
                  <p className={variant === "embedded" ? "text-xs leading-6 text-white/45" : "text-xs leading-6 text-muted-foreground"}>
                    Skriv din besked, eller tryk på Tal med Briefly for en rigtig samtale.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant={isRealtimeActive ? "default" : "outline"}
                  disabled={!realtimeVoiceSupported || isRealtimePending}
                  onClick={() => {
                    if (isRealtimeActive) {
                      stopRealtimeVoice();
                      return;
                    }

                    void startRealtimeVoice();
                  }}
                  className={
                    isRealtimeActive
                      ? "rounded-full bg-[#3C5C4E] text-white hover:bg-[#345045]"
                      : variant === "embedded"
                        ? "rounded-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                        : "rounded-full"
                  }
                >
                  {isRealtimePending ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
                  {isRealtimeActive ? "Afslut samtale" : "Tal med Briefly"}
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-full bg-[#3C5C4E] px-5 text-white hover:bg-[#345045]"
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Send til Briefly
                </Button>
              </div>
            </div>
          </form>
        </div>

        {variant === "page" ? (
          <div className="grid gap-4">
            <div className="rounded-[30px] border border-black/5 bg-white/82 p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Det kan den nu
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
                <li>Oprette en ny Google-kalenderaftale ud fra én besked i naturligt sprog.</li>
                <li>Oprette et Google Tasks-punkt i den valgte opgaveliste.</li>
                <li>Tilføje en eller flere varer til den fælles indkøbsliste.</li>
                <li>Oprette et punkt i madplanen og knytte ingredienser til det i samme omgang.</li>
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
