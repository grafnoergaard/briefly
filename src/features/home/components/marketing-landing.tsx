import type { ComponentType } from "react";
import Link from "next/link";
import { ArrowRight, CalendarRange, Mail, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function MarketingLanding() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(32,89,73,0.1),transparent_30%),linear-gradient(180deg,#fcfcfa_0%,#f1efe7_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col justify-between rounded-[36px] border border-white/70 bg-white/80 p-6 shadow-[0_40px_120px_-60px_rgba(17,24,39,0.65)] backdrop-blur-xl sm:p-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
              Briefly
            </p>
            <h1 className="mt-2 text-lg font-semibold tracking-[-0.03em]">
              En digital hverdagsplatform til mennesker og familier
            </h1>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/sign-in">Log ind</Link>
          </Button>
        </header>

        <section className="grid gap-6 py-8 md:grid-cols-[1.15fr_0.85fr] lg:py-14">
          <div className="space-y-6">
            <Badge className="rounded-full bg-[#e8f2ee] px-3 py-1 text-[#205949] hover:bg-[#e8f2ee]">
              Mere ro. Mindre mental load.
            </Badge>
            <div className="space-y-4">
              <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.07em] sm:text-6xl">
                Start dagen med én briefing i stedet for ti åbne mentale faner.
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-foreground/70">
                Briefly samler kalender, opgaver, indkøb, madplaner og familiens koordinering i
                én rolig, intelligent oversigt. Produktet bygger på de værktøjer, du allerede
                bruger, særligt Google-økosystemet, og omsætter information til overblik,
                prioritering og handling.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full bg-[#153d32] px-6 hover:bg-[#205949]">
                <Link href="/sign-in">
                  Kom i gang <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                <a href="#preview">Se dagens briefing</a>
              </Button>
            </div>
          </div>

          <Card id="preview" className="rounded-[32px] border-black/5 bg-[#101313] text-white">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <Badge className="rounded-full bg-white/10 hover:bg-white/10">Briefing</Badge>
                <Sparkles className="size-4 text-[#84c7ae]" />
              </div>
              <h3 className="text-2xl font-semibold tracking-[-0.05em]">Godmorgen, Claus.</h3>
              <ul className="space-y-3 text-sm leading-7 text-white/78">
                <li>Hvad skal du vide? Du har tre aftaler i dag.</li>
                <li>Hvad skal du gøre? Kør mod Randers senest kl. 08.10.</li>
                <li>Hvad skal du huske? Vigga har karate kl. 16.00.</li>
                <li>Hvad kræver opmærksomhed først? Der mangler mælk til aftensmad.</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 border-t border-black/5 pt-6 md:grid-cols-3">
          <ValueCard icon={CalendarRange} title="Én samlet hverdag" copy="Kalender, lister, indkøb og madplaner samles i én personlig oversigt." />
          <ValueCard icon={Mail} title="Bygget på dine vaner" copy="Briefly bruger de værktøjer, du allerede arbejder i, særligt Google-økosystemet." />
          <ValueCard icon={Sparkles} title="Ro før produktivitet" copy="Målet er ikke flere inputs, men mere nærvær, klarhed og overskud i hverdagen." />
        </section>
      </div>
    </div>
  );
}

type ValueCardProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  copy: string;
};

function ValueCard({ icon: Icon, title, copy }: ValueCardProps) {
  return (
    <div className="rounded-[28px] bg-muted/45 p-5">
      <Icon className="size-5 text-[#205949]" />
      <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em]">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{copy}</p>
    </div>
  );
}
