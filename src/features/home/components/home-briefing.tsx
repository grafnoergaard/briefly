import { AssistantChat } from "@/features/assistant/components/assistant-chat";
import { ReadBriefButton } from "@/features/home/components/read-brief-button";
import type { HomeBriefingModel } from "@/lib/types";

type HomeBriefingProps = {
  userName: string;
  briefing: HomeBriefingModel;
};

export function HomeBriefing({ userName, briefing }: HomeBriefingProps) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-black/5 bg-[#101313] text-white shadow-[0_30px_100px_-50px_rgba(0,0,0,0.85)] sm:rounded-[32px]">
      <div className="space-y-6 p-5 sm:space-y-8 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex w-fit rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/88">
            Briefly
          </span>
          <span className="font-mono text-[11px] text-white/45 sm:text-xs">{briefing.dateLabel}</span>
        </div>

        <div className="space-y-4">
          <h1 className="max-w-3xl text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.08em] sm:text-5xl">
            Her er det vigtigste, {userName}.
          </h1>
          <p className="max-w-4xl text-[15px] leading-8 text-white/80 sm:text-lg">
            {briefing.summary}
          </p>
          <div>
            <ReadBriefButton summary={briefing.summary} />
          </div>
        </div>

        <div className="border-t border-white/10 pt-5 sm:pt-6">
          <AssistantChat variant="embedded" />
        </div>
      </div>
    </section>
  );
}
