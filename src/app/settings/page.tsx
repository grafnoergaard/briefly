import { Card, CardContent } from "@/components/ui/card";
import { AppFrame } from "@/features/navigation/components/app-frame";
import { CalendarSelectionForm } from "@/features/calendar/components/calendar-selection-form";
import { CalendarSyncForm } from "@/features/calendar/components/calendar-sync-form";
import {
  getGoogleCalendarChoices,
  type GoogleCalendarChoice,
} from "@/features/integrations/google/google-calendar";
import {
  getGoogleTaskListChoices,
  type GoogleTaskListChoice,
} from "@/features/integrations/google/google-tasks";
import { TaskListSelectionForm } from "@/features/tasks/components/task-list-selection-form";
import { TasksSyncForm } from "@/features/tasks/components/tasks-sync-form";
import { requireUser } from "@/lib/auth";
import { getAiBriefSettings, hasOpenAiEnv } from "@/lib/ai-settings";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { saveAiSettingsAction } from "@/app/settings/actions";

type SettingsPageProps = {
  searchParams: Promise<{
    sync?: string;
    message?: string;
  }>;
};

const modelOptions = ["gpt-5-mini", "gpt-5", "gpt-5-nano"] as const;
const toneOptions = ["calm", "crisp", "family-focused"] as const;
const voiceOptions = [
  { value: "coral", label: "Coral" },
  { value: "marin", label: "Marin" },
  { value: "sage", label: "Sage" },
  { value: "cedar", label: "Cedar" },
  { value: "alloy", label: "Alloy" },
] as const;
const voiceSpeedOptions = [
  { value: "1", label: "Rolig" },
  { value: "1.16", label: "Naturlig" },
  { value: "1.26", label: "Kvikkere" },
] as const;

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireUser();
  const snapshot = await getDashboardSnapshot(user.id);
  const settings = await getAiBriefSettings(user.id);
  const params = await searchParams;
  const openAiReady = hasOpenAiEnv();
  let calendarChoices: GoogleCalendarChoice[] = [];
  let calendarSetupError: string | null = null;
  let taskListChoices: GoogleTaskListChoice[] = [];
  let taskListSetupError: string | null = null;

  try {
    calendarChoices = await getGoogleCalendarChoices(user.id);
  } catch (error) {
    calendarSetupError =
      error instanceof Error ? error.message : "Google Kalender er ikke klar endnu.";
  }

  try {
    taskListChoices = await getGoogleTaskListChoices(user.id);
  } catch (error) {
    taskListSetupError =
      error instanceof Error ? error.message : "Google Tasks er ikke klar endnu.";
  }

  return (
    <AppFrame currentPath="/settings" userLabel={snapshot.familyGroupName ?? user.email}>
      <div className="grid gap-4">
        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
              Indstillinger
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
              Tilpas Briefly i én rolig kolonne
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Her styrer du briefingens tone, AI-adfærd og datakilder, uden at resten af produktet
              bliver til en tung opsætningsskærm.
            </p>

            <div className="mt-6">
              {params.message ? (
                <div
                  className={
                    params.sync === "error"
                      ? "mb-4 rounded-[26px] border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-700"
                      : "mb-4 rounded-[26px] border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-700"
                  }
                >
                  {params.message}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              AI
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
              Hold briefingen aktuel og brugbar
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Slå AI til, når du vil have en genereret briefing, der reagerer på de nyeste data fra
              kalender, lister, madplan og indkøb.
            </p>

            <form action={saveAiSettingsAction} className="mt-5 space-y-5 rounded-[26px] bg-[#f0f4f1] p-4 sm:p-5">
              <div className="rounded-[22px] bg-[#f0f4f1] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  OpenAI-status
                </p>
                <p className="mt-2 text-sm leading-7 text-foreground/80">
                  {openAiReady
                    ? "OPENAI_API_KEY er tilgængelig. AI-briefing kan slås til."
                    : "OPENAI_API_KEY mangler. Appen bliver på den regelbaserede briefing, selv hvis du slår AI til her."}
                </p>
              </div>

              <div className="rounded-[22px] border border-border/70 p-4">
                <p className="text-sm font-semibold">Live AI-briefing</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Slå genererede briefinger til, så de følger de nyeste kendte data fra kalender,
                  lister, madplan og indkøb.
                </p>
                <label className="mt-4 grid gap-2 text-sm">
                  <span className="font-medium">AI-status</span>
                  <select
                    name="enabled"
                    defaultValue={settings.enabled ? "true" : "false"}
                    className="h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                  >
                    <option value="true">Aktiveret</option>
                    <option value="false">Deaktiveret</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm">
                <span className="font-medium">Model</span>
                <select
                  name="model"
                  defaultValue={settings.model}
                  className="h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                >
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium">Tone</span>
                <select
                  name="tone"
                  defaultValue={settings.tone}
                  className="h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                >
                  {toneOptions.map((tone) => (
                    <option key={tone} value={tone}>
                      {tone}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-[22px] border border-border/70 p-4">
                <p className="text-sm font-semibold">Stemme og oplæsning</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  De her indstillinger bruges både til `Tal med Briefly` og `Læs brief højt`, så
                  Briefly lyder ens på tværs af hele appen.
                </p>

                <div className="mt-4 grid gap-5">
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">Stemme</span>
                    <select
                      name="voice"
                      defaultValue={settings.voice}
                      className="h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                    >
                      {voiceOptions.map((voice) => (
                        <option key={voice.value} value={voice.value}>
                          {voice.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">Tempo</span>
                    <select
                      name="voiceSpeed"
                      defaultValue={String(settings.voiceSpeed)}
                      className="h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                    >
                      {voiceSpeedOptions.map((speed) => (
                        <option key={speed.value} value={speed.value}>
                          {speed.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">Sprogprincipper for stemmen</span>
                    <textarea
                      name="voiceStyle"
                      defaultValue={settings.voiceStyle}
                      rows={4}
                      className="rounded-[22px] border border-border bg-background px-4 py-3 text-sm leading-7 outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[22px] border border-border/70 p-4">
                <p className="text-sm font-semibold">Briefly-principper</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Skriv regler eller præferencer, som Briefly skal huske fremover. Brug det til
                  ting som tone, hvad der skal fremhæves, eller hvordan manglende madplan og
                  indkøb skal tolkes.
                </p>

                <label className="mt-4 grid gap-2 text-sm">
                  <span className="font-medium">Ekstra instruktioner til Briefly</span>
                  <textarea
                    name="customGuidance"
                    defaultValue={settings.customGuidance}
                    rows={5}
                    placeholder="Fx: Hvis der ikke er planlagt middag, skal det altid behandles som noget, der kræver opmærksomhed. Hvis indkøb er tomme, men middag mangler, må Briefly gerne antyde at der muligvis ikke er styr på aftensmaden endnu."
                    className="rounded-[22px] border border-border bg-background px-4 py-3 text-sm leading-7 outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                  />
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="w-full rounded-full bg-[#153d32] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#205949] sm:w-auto"
                >
                  Gem AI-indstillinger
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Sync-kilder
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
              Vælg hvad der skal fodre Briefly
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Kalender og lister arver kildevalg og sync herfra, så resten af produktet kan
              fokusere på at organisere dagen frem for opsætningen.
            </p>

            <div className="mt-5 space-y-5">
              <div className="rounded-[22px] bg-[#f0f4f1] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Kalendere
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Vælg de Google-kalendere, der skal drive Hjem og Kalender.
                </p>
                {calendarSetupError ? (
                  <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-800">
                    {calendarSetupError}
                  </div>
                ) : (
                  <div className="mt-4">
                    <CalendarSelectionForm calendars={calendarChoices} redirectTo="/settings" />
                  </div>
                )}
              </div>

              <div className="rounded-[22px] bg-[#f0f4f1] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Opgavelister
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Vælg de Google-opgavelister, der skal drive Hjem og Lister.
                </p>
                {taskListSetupError ? (
                  <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-800">
                    {taskListSetupError}
                  </div>
                ) : (
                  <div className="mt-4">
                    <TaskListSelectionForm taskLists={taskListChoices} redirectTo="/settings" />
                  </div>
                )}
              </div>

              <div className="rounded-[22px] bg-[#f0f4f1] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Kør sync
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Opdatér de delte cacher efter ændringer i dine kilder, eller når du vil have
                  Hjem, Kalender og Lister til at hente de nyeste Google-data.
                </p>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-[22px] border border-border/70 bg-white/80 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Kalender-sync
                    </p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      Opdatér de valgte Google-kalendere, som driver Hjem og Kalender.
                    </p>
                    <div className="mt-4">
                      <CalendarSyncForm />
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-border/70 bg-white/80 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Lister-sync
                    </p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      Opdatér de valgte Google-opgavelister, som driver Hjem og Lister.
                    </p>
                    <div className="mt-4">
                      <TasksSyncForm />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="space-y-5 p-6 sm:p-8">
            <div className="rounded-[26px] bg-[#f0f4f1] p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Status lige nu
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[22px] border border-border/70 bg-white/80 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Familie
                  </p>
                  <p className="mt-2 text-sm font-medium">{snapshot.familyGroupName ?? "Ikke forbundet"}</p>
                </div>
                <div className="rounded-[22px] border border-border/70 bg-white/80 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Kalender-cache
                  </p>
                  <p className="mt-2 text-sm font-medium">{snapshot.calendarEventCount} aftaler</p>
                </div>
                <div className="rounded-[22px] border border-border/70 bg-white/80 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Lister-cache
                  </p>
                  <p className="mt-2 text-sm font-medium">{snapshot.taskCount} punkter</p>
                </div>
                <div className="rounded-[22px] border border-border/70 bg-white/80 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Åbne indkøb
                  </p>
                  <p className="mt-2 text-sm font-medium">{snapshot.openShoppingItemCount} varer</p>
                </div>
              </div>
            </div>

            <div className="rounded-[26px] bg-[#f0f4f1] p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Sådan virker det
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
                <li>Briefingen på Hjem vises stadig i den samme rolige struktur.</li>
                <li>Når AI er slået til, bygger Briefly et struktureret brief-input og beder OpenAI om en kort, aktuel opsummering.</li>
                <li>Resultatet caches mod det aktuelle datagrundlag, så Hjem regenererer, når briefens data ændrer sig.</li>
                <li>Hvis AI fejler eller ikke er sat op, bliver den regelbaserede briefing stående automatisk.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  );
}
