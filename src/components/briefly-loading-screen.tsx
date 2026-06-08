type BrieflyLoadingScreenProps = {
  label?: string;
  detail?: string;
};

export function BrieflyLoadingScreen({
  label = "Briefly",
  detail = "Henter dagens briefing, kalender og familiens overblik.",
}: BrieflyLoadingScreenProps) {
  return (
    <section className="min-h-screen bg-[#101313] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl rounded-[36px] border border-white/10 bg-white/[0.03] p-8 shadow-[0_30px_120px_-60px_rgba(0,0,0,0.85)] sm:p-10">
          <div className="flex flex-col gap-8">
            <div className="flex items-center gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-[#3C5C4E]/45 bg-[#3C5C4E]/12" />
                <div className="absolute inset-[6px] rounded-full border border-[#3C5C4E]/60 animate-[pulse_1.8s_ease-in-out_infinite]" />
                <div className="absolute inset-[14px] rounded-full bg-[#3C5C4E] shadow-[0_0_32px_rgba(60,92,78,0.45)]" />
                <div className="absolute bottom-[-6px] left-1/2 h-5 w-14 -translate-x-1/2 rounded-full bg-[#3C5C4E]/30 blur-md" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex rounded-full bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-white/68">
                  {label}
                </div>
                <h1 className="text-3xl font-semibold tracking-[-0.06em] text-white sm:text-4xl">
                  Tænker og samler det vigtigste
                </h1>
              </div>
            </div>

            <p className="max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
              {detail}
            </p>

            <div className="flex items-center gap-3">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className="h-2.5 w-10 rounded-full bg-[#3C5C4E]"
                  style={{
                    opacity: 0.28,
                    animation: "briefly-wave 1.25s ease-in-out infinite",
                    animationDelay: `${index * 0.12}s`,
                  }}
                />
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                "Kalender og dagens aftaler",
                "Madplan og indkøb",
                "Aktuel AI-briefing",
              ].map((item, index) => (
                <div
                  key={item}
                  className="rounded-[24px] border border-white/8 bg-white/[0.02] px-4 py-4 text-sm text-white/58"
                  style={{
                    animation: "briefly-fade 1.4s ease-in-out infinite",
                    animationDelay: `${index * 0.18}s`,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
