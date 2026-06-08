import { createGoogleTaskAction } from "@/app/tasks/actions";

export function TaskComposerForm() {
  return (
    <form action={createGoogleTaskAction} className="rounded-[26px] border border-border/70 bg-white/70 p-5">
      <div className="grid gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Nyt punkt
          </p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            Tilføj en enkel husker, en lille opgave eller en løs note til hverdagen.
          </p>
          <input
            name="title"
            type="text"
            placeholder="Fx: Køb batterier"
            className="mt-3 h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
            required
          />
        </div>
        <div>
          <textarea
            name="notes"
            rows={3}
            placeholder="Valgfri note"
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-full bg-[#153d32] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#205949]"
          >
            Tilføj til liste
          </button>
        </div>
      </div>
    </form>
  );
}
