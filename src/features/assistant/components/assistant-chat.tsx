"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Loader2, Mic, MicOff, Sparkles, User2, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  meta?: string | null;
  isError?: boolean;
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
  }
}

export function AssistantChat({ variant = "page" }: AssistantChatProps) {
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
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [isRealtimePending, setIsRealtimePending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const realtimePeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const realtimeDataChannelRef = useRef<RTCDataChannel | null>(null);
  const realtimeLocalStreamRef = useRef<MediaStream | null>(null);
  const realtimeAssistantMessageIdRef = useRef<string | null>(null);
  const handledRealtimeCallIdsRef = useRef<Set<string>>(new Set());

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
  const speechSynthesisSupported =
    hasMounted &&
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined";
  const realtimeVoiceSupported =
    hasMounted &&
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  const submitMessage = (message: string) => {
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
          }),
        });

        const payload = (await response.json()) as
          | {
              reply?: string;
              action?: string;
              createdEvent?: {
                title: string;
                calendarName: string;
                timeLabel: string;
              } | null;
              completedActions?: string[];
              error?: string;
            }
          | undefined;

        if (!response.ok || payload?.error) {
          throw new Error(payload?.error ?? "Briefly-assistenten fejlede.");
        }

        setMessages((current) =>
          current.map((item) =>
            item.id === placeholderId
              ? {
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
                }
              : item,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Briefly-assistenten fejlede uventet.";

        setMessages((current) =>
          current.map((item) =>
            item.id === placeholderId
              ? {
                  id: placeholderId,
                  role: "assistant",
                  content: message,
                  meta: "Fejl",
                  isError: true,
                }
              : item,
          ),
        );
      }
    });
  };

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
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "da-DK";

    recognition.onresult = (event) => {
      let transcript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }

      transcriptRef.current = transcript.trim();
      setDraft(transcriptRef.current);
      setVoiceStatus("Lytter…");
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setVoiceStatus(
        event.error === "not-allowed"
          ? "Mikrofonadgang blev ikke givet."
          : "Talegenkendelse fejlede. Prøv igen.",
      );
    };

    recognition.onend = () => {
      const finalTranscript = transcriptRef.current.trim();

      setIsListening(false);
      setVoiceStatus(finalTranscript ? "Tale fanget." : null);

      if (finalTranscript) {
        transcriptRef.current = "";
        setDraft("");
        submitMessage(finalTranscript);
      }
    };

    recognitionRef.current = recognition;
  }, [speechRecognitionSupported]);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current || isPending) {
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setVoiceStatus("Stopper…");
      return;
    }

    transcriptRef.current = "";
    setDraft("");
    setVoiceStatus("Starter mikrofon…");
    setIsListening(true);
    recognitionRef.current.start();
  };

  function speakText(text: string) {
    if (!speechSynthesisSupported) {
      setVoiceStatus("Stemmesvar understøttes ikke i denne browser.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "da-DK";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setVoiceStatus("Briefly svarer med stemme…");
    utterance.onend = () => setVoiceStatus("Stemmesvar afspillet.");
    utterance.onerror = () => setVoiceStatus("Stemmesvar kunne ikke afspilles.");
    window.speechSynthesis.speak(utterance);
  }

  const sendRealtimeEvent = (event: Record<string, unknown>) => {
    const channel = realtimeDataChannelRef.current;

    if (!channel || channel.readyState !== "open") {
      return;
    }

    channel.send(JSON.stringify(event));
  };

  const appendRealtimeAssistantDelta = (delta: string) => {
    if (!delta) {
      return;
    }

    setMessages((current) => {
      const existingId = realtimeAssistantMessageIdRef.current;

      if (!existingId) {
        const nextId = crypto.randomUUID();
        realtimeAssistantMessageIdRef.current = nextId;
        return [
          ...current,
          {
            id: nextId,
            role: "assistant",
            content: delta,
            meta: "Live voice",
          },
        ];
      }

      return current.map((message) =>
        message.id === existingId
          ? {
              ...message,
              content: `${message.content}${delta}`,
              meta: "Live voice",
            }
          : message,
      );
    });
  };

  const completeRealtimeAssistantMessage = () => {
    realtimeAssistantMessageIdRef.current = null;
  };

  const appendRealtimeUserTranscript = (transcript: string) => {
    const nextTranscript = transcript.trim();

    if (!nextTranscript) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: nextTranscript,
      },
    ]);
  };

  const runRealtimeAssistantTool = async (callId: string, rawArguments: string) => {
    if (handledRealtimeCallIdsRef.current.has(callId)) {
      return;
    }

    handledRealtimeCallIdsRef.current.add(callId);
    setRealtimeStatus("Briefly udfører handlingen…");

    let output = "";

    try {
      const parsedArguments = JSON.parse(rawArguments) as { instruction?: string };
      const instruction = parsedArguments.instruction?.trim();

      if (!instruction) {
        throw new Error("Realtime action mangler instruction.");
      }

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: instruction,
        }),
      });

      const payload = (await response.json()) as
        | {
            reply?: string;
            createdEvent?: {
              title: string;
              calendarName: string;
              timeLabel: string;
            } | null;
            completedActions?: string[];
            error?: string;
          }
        | undefined;

      if (!response.ok || payload?.error) {
        throw new Error(payload?.error ?? "Briefly-assistenten fejlede.");
      }

      output = JSON.stringify({
        ok: true,
        reply: payload?.reply ?? "Det er på plads.",
        completedActions: payload?.completedActions ?? [],
        createdEvent: payload?.createdEvent ?? null,
      });
    } catch (error) {
      output = JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Realtime-handlingen fejlede.",
      });
    }

    sendRealtimeEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output,
      },
    });
    sendRealtimeEvent({
      type: "response.create",
    });
    setRealtimeStatus("Live voice aktiv.");
  };

  const cleanupRealtime = useCallback(() => {
    realtimeDataChannelRef.current?.close();
    realtimeDataChannelRef.current = null;

    realtimePeerConnectionRef.current?.close();
    realtimePeerConnectionRef.current = null;

    realtimeLocalStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeLocalStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }

    completeRealtimeAssistantMessage();
    handledRealtimeCallIdsRef.current.clear();
    setIsRealtimeActive(false);
    setIsRealtimePending(false);
  }, []);

  const handleRealtimeEvent = (event: Record<string, unknown>) => {
    const type = typeof event.type === "string" ? event.type : null;

    if (!type) {
      return;
    }

    if (type === "session.created" || type === "session.updated") {
      setRealtimeStatus("Live voice aktiv.");
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      setRealtimeStatus("Briefly lytter…");
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      setRealtimeStatus("Briefly tænker…");
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = typeof event.transcript === "string" ? event.transcript : "";
      appendRealtimeUserTranscript(transcript);
      return;
    }

    if (type === "response.output_text.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      appendRealtimeAssistantDelta(delta);
      return;
    }

    if (type === "response.done") {
      completeRealtimeAssistantMessage();
      setRealtimeStatus("Live voice aktiv.");
      return;
    }

    if (type === "response.output_item.done") {
      const item =
        event.item && typeof event.item === "object"
          ? (event.item as Record<string, unknown>)
          : null;

      if (
        item?.type === "function_call" &&
        typeof item.call_id === "string" &&
        typeof item.arguments === "string"
      ) {
        void runRealtimeAssistantTool(item.call_id, item.arguments);
      }

      return;
    }

    if (type === "error") {
      const errorPayload =
        event.error && typeof event.error === "object"
          ? (event.error as Record<string, unknown>)
          : null;
      const message =
        typeof errorPayload?.message === "string"
          ? errorPayload.message
          : "Live voice fejlede.";
      setRealtimeStatus(message);
    }
  };

  const stopRealtimeVoice = () => {
    cleanupRealtime();
    setRealtimeStatus("Live voice afsluttet.");
  };

  const startRealtimeVoice = async () => {
    if (!realtimeVoiceSupported || isRealtimePending) {
      return;
    }

    if (speechSynthesisSupported) {
      window.speechSynthesis.cancel();
    }

    setAutoSpeakEnabled(false);
    setVoiceStatus(null);
    setIsRealtimePending(true);
    setRealtimeStatus("Starter live voice…");

    try {
      const tokenResponse = await fetch("/api/realtime/session", {
        method: "POST",
      });
      const tokenPayload = (await tokenResponse.json()) as
        | {
            client_secret?: {
              value?: string;
            };
            value?: string;
            error?: string;
          }
        | undefined;

      if (!tokenResponse.ok || tokenPayload?.error) {
        throw new Error(tokenPayload?.error ?? "Kunne ikke starte live voice.");
      }

      const ephemeralKey = tokenPayload?.client_secret?.value ?? tokenPayload?.value;

      if (!ephemeralKey) {
        throw new Error("Realtime session returnerede ikke en client secret.");
      }

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const peerConnection = new RTCPeerConnection();
      realtimeLocalStreamRef.current = localStream;
      realtimePeerConnectionRef.current = peerConnection;

      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      peerConnection.ontrack = (event) => {
        if (!remoteAudioRef.current) {
          return;
        }

        remoteAudioRef.current.srcObject = event.streams[0] ?? null;
      };

      peerConnection.onconnectionstatechange = () => {
        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected" ||
          peerConnection.connectionState === "closed"
        ) {
          cleanupRealtime();
          setRealtimeStatus("Live voice forbindelsen blev afbrudt.");
        }
      };

      const dataChannel = peerConnection.createDataChannel("oai-events");
      realtimeDataChannelRef.current = dataChannel;

      dataChannel.addEventListener("open", () => {
        setIsRealtimeActive(true);
        setIsRealtimePending(false);
        setRealtimeStatus("Live voice aktiv. Tal frit til Briefly.");

        sendRealtimeEvent({
          type: "session.update",
          session: {
            type: "realtime",
            instructions:
              "You are Briefly, a Danish assistant for everyday life. Speak Danish. Keep replies practical, calm, warm, and short enough for voice. Help the user feel more clarity and less mental load. Use the life_os_action tool whenever the user asks you to create or change something in calendar, tasks, shopping, or meal plan. Do not keep talking about stale plans from earlier this week unless the user explicitly asks. If a request is ambiguous, ask one short clarification question.",
            output_modalities: ["audio", "text"],
            tool_choice: "auto",
            tools: [
              {
                type: "function",
                name: "life_os_action",
                description:
                  "Execute a Briefly action such as creating a calendar event, creating a task, adding shopping items, or creating a meal plan entry.",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    instruction: {
                      type: "string",
                      description:
                        "The exact Danish instruction that should be executed by the Briefly backend.",
                    },
                  },
                  required: ["instruction"],
                },
              },
            ],
          },
        });
      });

      dataChannel.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          handleRealtimeEvent(payload);
        } catch {
          setRealtimeStatus("Live voice modtog en ukendt hændelse.");
        }
      });

      dataChannel.addEventListener("close", () => {
        cleanupRealtime();
        setRealtimeStatus("Live voice afsluttet.");
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const text = await sdpResponse.text();
        throw new Error(text || "OpenAI Realtime WebRTC failed.");
      }

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (error) {
      cleanupRealtime();
      setRealtimeStatus(
        error instanceof Error ? error.message : "Kunne ikke starte live voice.",
      );
    } finally {
      setIsRealtimePending(false);
    }
  };

  useEffect(() => {
    if (!autoSpeakEnabled || !speechSynthesisSupported) {
      return;
    }

    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && !message.isError && message.meta !== "Arbejder");

    if (!latestAssistantMessage) {
      return;
    }

    if (lastSpokenMessageIdRef.current === latestAssistantMessage.id) {
      return;
    }

    if (messages.length <= 1) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(latestAssistantMessage.content);
    utterance.lang = "da-DK";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setVoiceStatus("Briefly svarer med stemme…");
    utterance.onend = () => setVoiceStatus("Stemmesvar afspillet.");
    utterance.onerror = () => setVoiceStatus("Stemmesvar kunne ikke afspilles.");
    window.speechSynthesis.speak(utterance);
    lastSpokenMessageIdRef.current = latestAssistantMessage.id;
  }, [autoSpeakEnabled, messages, speechSynthesisSupported]);

  useEffect(() => {
    return () => {
      cleanupRealtime();

      if (speechSynthesisSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [cleanupRealtime, speechSynthesisSupported]);

  const toggleAutoSpeak = () => {
    if (!speechSynthesisSupported) {
      setVoiceStatus("Stemmesvar understøttes ikke i denne browser.");
      return;
    }

    if (autoSpeakEnabled) {
      window.speechSynthesis.cancel();
      setAutoSpeakEnabled(false);
      setVoiceStatus("Auto-oplæsning er slået fra.");
      return;
    }

    setAutoSpeakEnabled(true);
    setVoiceStatus("Auto-oplæsning er slået til.");
  };

  return (
    <div className="grid gap-4">
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
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
            Fortæl Briefly noget i naturligt sprog, og det omsætter det til handling i kalender,
            lister, indkøb eller madplan. Du kan skrive, trykke på mikrofonen eller tale live med
            Realtime-stemme.
          </p>
        </div>
      ) : null}

      <div className={variant === "page" ? "grid gap-4 xl:grid-cols-[1.15fr_0.85fr]" : "grid gap-4"}>
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
                    ? "ml-auto max-w-[88%] rounded-[26px] bg-[#153d32] px-4 py-3 text-sm leading-7 text-white"
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
                {variant === "page" && message.role === "assistant" && !message.isError && message.meta !== "Arbejder" ? (
                  <button
                    type="button"
                    onClick={() => speakText(message.content)}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-foreground/70 transition hover:bg-white"
                  >
                    <Volume2 className="size-3.5" />
                    Læs højt
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <form
            className={
              variant === "embedded"
                ? "rounded-[28px] border border-white/10 bg-white/5 p-3"
                : "mt-5 rounded-[28px] border border-black/5 bg-[#f7f7f3] p-3"
            }
            onSubmit={(event) => {
              event.preventDefault();

              const nextMessage = draft.trim();

              if (!nextMessage) {
                return;
              }

              setDraft("");
              submitMessage(nextMessage);
            }}
            >
            <label className="block">
              <span className="sr-only">Message Briefly</span>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Skriv det du vil have Briefly til at gøre"
                rows={4}
                className={
                  variant === "embedded"
                    ? "min-h-28 w-full resize-none rounded-[22px] border border-transparent bg-white/95 px-4 py-3 text-sm leading-7 text-foreground outline-none transition focus:border-white/20 focus:ring-2 focus:ring-white/10"
                    : "min-h-28 w-full resize-none rounded-[22px] border border-transparent bg-white px-4 py-3 text-sm leading-7 text-foreground outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                }
              />
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
                ) : speechRecognitionSupported ? (
                  <p className={variant === "embedded" ? "text-xs leading-6 text-white/45" : "text-xs leading-6 text-muted-foreground"}>
                    Tryk på mikrofonen og sig det højt i stedet for at skrive.
                  </p>
                ) : (
                  <p className={variant === "embedded" ? "text-xs leading-6 text-white/45" : "text-xs leading-6 text-muted-foreground"}>
                    Tale-til-tekst understøttes ikke i denne browser.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                      ? "rounded-full bg-[#153d32] text-white hover:bg-[#205949]"
                      : variant === "embedded"
                        ? "rounded-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                        : "rounded-full"
                  }
                >
                  {isRealtimePending ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
                  {isRealtimeActive ? "Afslut live stemme" : "Start live stemme"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!speechSynthesisSupported || isRealtimeActive}
                  onClick={toggleAutoSpeak}
                  className={variant === "embedded" ? "rounded-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white" : "rounded-full"}
                >
                  {autoSpeakEnabled ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  {autoSpeakEnabled ? "Stop stemmesvar" : "Stemmesvar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!speechRecognitionSupported || isPending || isRealtimeActive}
                  onClick={toggleVoiceInput}
                  className={variant === "embedded" ? "rounded-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white" : "rounded-full"}
                >
                  {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  {isListening ? "Stop lytning" : "Tal til Briefly"}
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-full bg-[#153d32] px-5 text-white hover:bg-[#205949]"
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
