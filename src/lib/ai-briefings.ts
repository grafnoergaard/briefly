import { createHash } from "node:crypto";
import { format, parseISO, startOfDay } from "date-fns";
import { da } from "date-fns/locale";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HomeBriefingAiInput, HomeBriefingAiSection, HomeBriefingModel } from "@/lib/types";
import type { AiBriefSettings } from "@/lib/ai-settings";

const AI_BRIEF_SOURCE_VERSION = "home_brief_v7";
const AI_BRIEF_INSTRUCTIONS =
  "Skriv en sammenhængende Life OS-briefing på dansk som ét samlet afsnit på 4 til 5 sætninger. Life OS er en rolig, intelligent hverdagsbriefing, ikke et produktivitetsdashboard. Gå direkte til det vigtigste; ingen hilsen og ingen overskrift som 'lige nu' eller 'i dag'. Briefingen skal være familiebevidst og tydeligt skelne mellem personlige opgaver, familie-logistik og madplan/indkøb, men uden at lyde mekanisk. Nævn de konkrete kalenderaftaler ved navn i konteksten; det er ikke nok at skrive hvor mange aftaler der er. Hvis to aftaler overlapper, skal det siges tydeligt. Brug den første del af briefingen på dagens tidskritiske kalender og eventuelle overlap. Brug derefter opgaver, men kun hvis der er reelt relevante åbne ting, især dem der forfalder i dag eller er forsinkede. Aftensmad skal beskrives som aktuel kontekst; undgå unødvendige datoer på dagens middag. Afslut med indkøb og sig tydeligt, hvis listen er under kontrol. Briefingen skal reducere mental belastning og skabe ro, nærvær og overskud. Vær dato- og ugebevidst: respekter den aktuelle ISO-uge, nævn weekend hvis det er relevant, og behandl aldrig gamle planer eller gammel familieaktivitet som aktuelle. Ignorér måltider, aftaler eller familieopdateringer der ligger i fortiden, medmindre de stadig har åbne konsekvenser i dag. Brug konkrete detaljer fra kalender, lister, madplan og indkøb når de findes. Behandl lister som en enkel to-do-liste, ikke som et dramatisk prioriteringssystem. Skriv roligt, præcist og praktisk. Undgå fyld, undgå at gentage kategorinavne, og undgå generiske opsummeringer som 'du har 2 kalenderpunkter i dag'. Brug ikke markdown, punktlister, overskrifter eller labels.";

type ResolveAiBriefSummaryInput = {
  userId: string;
  familyGroupId: string | null;
  fallbackSummary: string;
  aiInput: HomeBriefingAiInput;
  settings: AiBriefSettings;
};

export async function resolveAiBriefSummary({
  userId,
  familyGroupId,
  fallbackSummary,
  aiInput,
  settings,
}: ResolveAiBriefSummaryInput): Promise<
  Pick<HomeBriefingModel["ai"], "mode" | "status" | "promptText" | "input" | "sections"> & {
    summary: string;
  }
> {
  const promptText = buildPromptText(aiInput, settings.tone);
  const promptHash = createHash("sha256")
    .update(`${AI_BRIEF_SOURCE_VERSION}\n${AI_BRIEF_INSTRUCTIONS}\n${promptText}`)
    .digest("hex");

  if (!settings.enabled) {
    return {
      summary: fallbackSummary,
      mode: "disabled",
      status: "AI-briefing er slået fra i Indstillinger.",
      input: aiInput,
      promptText,
      sections: buildFallbackSections(aiInput),
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      summary: fallbackSummary,
      mode: "rule_based_ready",
      status: "OPENAI_API_KEY mangler, så den regelbaserede briefing er stadig aktiv.",
      input: aiInput,
      promptText,
      sections: buildFallbackSections(aiInput),
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      summary: fallbackSummary,
      mode: "rule_based_ready",
      status: "Supabase er utilgængelig, så den regelbaserede briefing er stadig aktiv.",
      input: aiInput,
      promptText,
      sections: buildFallbackSections(aiInput),
    };
  }

  const dayStart = startOfDay(new Date()).toISOString();
  const { data: cachedBrief } = await supabase
    .from("ai_briefings")
    .select("summary, model, generated_at")
    .eq("profile_id", userId)
    .eq("briefing_type", "morning")
    .eq("model", settings.model)
    .contains("prompt_snapshot", {
      tone: settings.tone,
      source: AI_BRIEF_SOURCE_VERSION,
      promptHash,
    })
    .gte("generated_at", dayStart)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedBrief?.summary) {
    return {
      summary: cachedBrief.summary,
      mode: "generated",
      status: `AI-briefingen er opdateret til de seneste kendte data og blev cachet med ${cachedBrief.model ?? settings.model}.`,
      input: aiInput,
      promptText,
      sections: buildSectionsFromSummary(cachedBrief.summary, aiInput),
    };
  }

  try {
    const generatedSummary = await generateAiBrief({
      model: settings.model,
      promptText,
    });

    await supabase.from("ai_briefings").insert({
      profile_id: userId,
      family_group_id: familyGroupId,
      briefing_type: "morning",
      model: settings.model,
      summary: generatedSummary,
      prompt_snapshot: {
        source: AI_BRIEF_SOURCE_VERSION,
        tone: settings.tone,
        promptHash,
        input: aiInput,
        generatedFor: format(new Date(), "yyyy-MM-dd"),
      },
    });

    return {
      summary: generatedSummary,
      mode: "generated",
      status: `AI-briefing genereret med ${settings.model} for de seneste kendte data.`,
      input: aiInput,
      promptText,
      sections: buildSectionsFromSummary(generatedSummary, aiInput),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukendt fejl i AI-briefing.";

    return {
      summary: fallbackSummary,
      mode: "error",
      status: `AI-briefing fejlede, så den regelbaserede version vises i stedet. ${message}`,
      input: aiInput,
      promptText,
      sections: buildFallbackSections(aiInput),
    };
  }
}

async function generateAiBrief({
  model,
  promptText,
}: {
  model: string;
  promptText: string;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      instructions: AI_BRIEF_INSTRUCTIONS,
      input: promptText,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Responses API returnerede ${response.status}.`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const text =
    payload.output_text?.trim() ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text" && typeof item.text === "string")
      ?.text?.trim();

  if (!text) {
    throw new Error("OpenAI returnerede en tom briefing.");
  }

  return text;
}

function buildPromptText(input: HomeBriefingAiInput, tone: string) {
  const todayEvents = input.todayEvents.length
    ? input.todayEvents
        .map((event) => {
          const timeLabel = event.isAllDay ? "hele dagen" : format(parseISO(event.startsAt), "HH.mm");
          const location = event.location ? `, ${event.location}` : "";
          const calendar = event.calendarName ? `, kalender: ${event.calendarName}` : "";
          return `${event.title} (${timeLabel}${location}${calendar})`;
        })
        .join(", ")
    : "ingen";
  const overlaps = input.overlappingEvents.length
    ? input.overlappingEvents
        .map(
          (overlap) =>
            `${overlap.firstTitle} kl. ${format(parseISO(overlap.firstStartsAt), "HH.mm")} overlapper med ${overlap.secondTitle} kl. ${format(parseISO(overlap.secondStartsAt), "HH.mm")}`,
        )
        .join(", ")
    : "ingen overlap";
  const topTasks = input.topTasks.length
    ? input.topTasks
        .map((task) => {
          const due = task.dueAt
            ? `, forfalder ${format(parseISO(task.dueAt), "EEE HH.mm", { locale: da })}`
            : "";
          const list = task.taskListName ? `, liste: ${task.taskListName}` : "";
          const notes = task.notes ? `, note: ${task.notes}` : "";
          return `${task.title}${due}${list}${notes}`;
        })
        .join(", ")
    : "ingen";
  const personalTasks = input.personalTasks.length
    ? input.personalTasks
        .map(
          (task) =>
            `${task.title}${task.dueAt ? `, forfalder ${format(parseISO(task.dueAt), "EEE HH.mm", { locale: da })}` : ""}`,
        )
        .join(", ")
    : "ingen";
  const familyTasks = input.familyTasks.length
    ? input.familyTasks
        .map(
          (task) =>
            `${task.title}${task.dueAt ? `, forfalder ${format(parseISO(task.dueAt), "EEE HH.mm", { locale: da })}` : ""}`,
        )
        .join(", ")
    : "ingen";
  const familyLogistics = input.familyLogistics.length
    ? input.familyLogistics
        .map((event) => `${event.title}${event.isAllDay ? " hele dagen" : ` kl. ${format(parseISO(event.startsAt), "HH.mm")}`}`)
        .join(", ")
    : "ingen";
  const shopping = input.openShoppingItems.length
    ? input.openShoppingItems
        .map((item) => `${item.label}${item.mealPlanTitle ? ` (til ${item.mealPlanTitle})` : ""}`)
        .join(", ")
    : "ingen";
  const meals = input.upcomingMeals.length
    ? input.upcomingMeals
        .map(
          (meal) =>
            `${meal.title} ${format(parseISO(meal.plannedFor), "EEE dd MMM", { locale: da })}${meal.notes ? `, note: ${meal.notes}` : ""}`,
        )
        .join(", ")
    : "ingen";
  const currentMeal = input.todayMeal
    ? `${input.todayMeal.title}${input.todayMeal.notes ? `, note: ${input.todayMeal.notes}` : ""}`
    : "ingen dagens middag";
  const familyFeed = input.familyFeed.length
    ? input.familyFeed.map((item) => `${item.summary} (${item.entityType})`).join(", ")
    : "ingen";

  return [
    `Tone: ${tone}.`,
    `Dato: ${input.dateLabel}.`,
    `Klokken er nu ${input.currentTimeLabel}.`,
    `Familiegruppe: ${input.familyGroupName ?? "ikke forbundet"}.`,
    `Dette er aktiv kontekst for den aktuelle uge, ikke arkivkontekst.`,
    `Dagens kalender: ${todayEvents}.`,
    `Overlap i kalenderen: ${overlaps}.`,
    `Familie-logistik i kalenderen: ${familyLogistics}.`,
    `Åben to-do-liste: ${topTasks}.`,
    `Personlige opgaver: ${personalTasks}.`,
    `Familieopgaver: ${familyTasks}.`,
    `Dagens middag: ${currentMeal}.`,
    `Kommende madplan: ${meals}.`,
    `Åbne indkøbsvarer: ${shopping}.`,
    `Seneste familieaktivitet kun for den aktuelle uge: ${familyFeed}.`,
    `Dagens form: ${input.dayShape}.`,
    `Integrationsstatus: ${input.integrationStatus}.`,
    "Skriv en aktuel briefing, ikke en ren morgenbriefing.",
    "Hold rækkefølgen stram: 1) dagens konkrete kalender og det vigtigste tidspunkt, 2) eventuelle overlap eller familie-logistik, 3) relevante personlige eller fælles opgaver, 4) aftensmad, 5) manglende indkøb.",
    "Brug de faktiske aftalenavne, faktiske tidspunkter, faktiske opgavetitler, den aktuelle middag og de faktiske manglende indkøbsvarer, når de findes.",
    "Start ikke med en hilsen. Det må ikke lyde som en assistent. Det skal lyde som en kort personlig briefing.",
  ].join(" ");
}

function buildSectionsFromSummary(summary: string, input: HomeBriefingAiInput): HomeBriefingAiSection[] {
  return buildFallbackSections(input);
}

function buildFallbackSections(input: HomeBriefingAiInput): HomeBriefingAiSection[] {
  return [
    {
      key: "time",
      label: "Tidspunkt",
      text: input.todayEvents.length > 0
        ? `I kalenderen i dag ligger ${input.todayEvents.map((event) => `${event.title} ${event.isAllDay ? "hele dagen" : `kl. ${format(parseISO(event.startsAt), "HH.mm")}`}`).join(", ")}.`
        : "Der er ingen stor kalenderdeadline lige nu.",
    },
    {
      key: "task",
      label: "Vigtigste punkt",
      text: input.personalTasks[0]
        ? `Personligt ligger ${input.personalTasks[0].title}${input.personalTasks[0].dueAt ? ` og forfalder ${format(parseISO(input.personalTasks[0].dueAt), "EEE HH.mm", { locale: da })}` : ""}.`
        : input.familyTasks[0]
          ? `I familien ligger ${input.familyTasks[0].title}${input.familyTasks[0].dueAt ? ` og forfalder ${format(parseISO(input.familyTasks[0].dueAt), "EEE HH.mm", { locale: da })}` : ""}.`
          : "Der er ingen synkroniseret opgave, der kræver særlig opmærksomhed lige nu.",
    },
    {
      key: "dinner",
      label: "Aftensmad",
      text: input.todayMeal
        ? `Aftensmaden er ${input.todayMeal.title}.`
        : input.upcomingMeals[0]
        ? `Næste ret i madplanen er ${input.upcomingMeals[0].title}.`
        : "Der er endnu ingen madplan gemt.",
    },
    {
      key: "shopping",
      label: "Indkøb",
      text: input.openShoppingItems.length
        ? `${input.openShoppingItems.slice(0, 2).map((item) => item.label).join(" og ")} mangler stadig opmærksomhed på indkøbslisten.`
        : "Indkøbene er under kontrol lige nu.",
    },
  ];
}
