import { createFamilyGroupAction } from "@/app/family/actions";

type FamilyGroupSetupFormProps = {
  redirectTo?: string;
};

export function FamilyGroupSetupForm({ redirectTo = "/meal-plan" }: FamilyGroupSetupFormProps) {
  return (
    <form action={createFamilyGroupAction} className="rounded-[26px] bg-muted/45 p-5">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        Familieopsætning
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Opret jeres første familiegruppe</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Det åbner for et fælles familiefeed, madplan og indkøbsliste i Supabase.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          name="name"
          type="text"
          required
          placeholder="For example: Hjemme hos os"
          className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
        />
        <button
          type="submit"
          className="w-full rounded-full bg-[#153d32] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#205949] md:w-auto"
        >
          Opret familie
        </button>
      </div>
    </form>
  );
}
