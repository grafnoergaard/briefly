import { AssistantChat } from "@/features/assistant/components/assistant-chat";
import { ReadBriefButton } from "@/features/home/components/read-brief-button";
import type { HomeBriefingModel } from "@/lib/types";

type HomeBriefingProps = {
  userName: string;
  briefing: HomeBriefingModel;
};

export function HomeBriefing({ userName, briefing }: HomeBriefingProps) {
  return (
    <section className="rounded-[32px] border border-black/5 bg-[#101313] text-white shadow-[0_30px_100px_-50px_rgba(0,0,0,0.85)]">
      <div className="space-y-8 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/88">
            Briefly
          </span>
          <span className="font-mono text-xs text-white/45">{briefing.dateLabel}</span>
        </div>

        <div className="space-y-4">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.06em] sm:text-5xl">
            Her er det vigtigste, {userName}.
          </h1>
          <p className="max-w-4xl text-base leading-8 text-white/80 sm:text-lg">
            {briefing.summary}
          </p>
          <div>
            <ReadBriefButton summary={briefing.summary} />
          </div>
        </div>

        <div className="border-t border-white/10 pt-6">
          <AssistantChat variant="embedded" />
        </div>
      </div>
    </section>
  );
}
