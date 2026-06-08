import { createShoppingListAction } from "@/app/family/actions";
import { AppFrame } from "@/features/navigation/components/app-frame";
import { FamilyGroupSetupForm } from "@/features/family/components/family-group-setup-form";
import { ShoppingItemForm } from "@/features/family/components/shopping-item-form";
import { ShoppingList } from "@/features/family/components/shopping-list";
import { requireUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getFamilyWorkspaceData } from "@/lib/family";

type ShoppingPageProps = {
  searchParams: Promise<{
    sort?: string;
    sync?: string;
    message?: string;
    list?: string;
    view?: string;
  }>;
};

export default async function ShoppingPage({ searchParams }: ShoppingPageProps) {
  const user = await requireUser();
  const snapshot = await getDashboardSnapshot(user.id);
  const params = await searchParams;
  const family = await getFamilyWorkspaceData(user.id, {
    shoppingListId: params.list,
  });
  const sortMode = params.sort === "category" ? "category" : "manual";
  const viewMode =
    params.view === "add" || params.view === "lists" || params.view === "shop"
      ? params.view
      : "shop";
  const activeList = family.shoppingLists.find((list) => list.id === family.activeShoppingListId) ?? null;
  const baseQuery = `list=${family.activeShoppingListId ?? ""}&sort=${sortMode}`;

  return (
    <AppFrame currentPath="/shopping" userLabel={snapshot.familyGroupName ?? user.email}>
      {params.message ? (
        <div
          className={
            params.sync === "error"
              ? "mb-4 rounded-[26px] border border-red-300/20 bg-red-500/10 p-4 text-sm leading-7 text-red-100"
              : "mb-4 rounded-[26px] border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100"
          }
        >
          {params.message}
        </div>
      ) : null}

      {!family.familyGroupId ? (
        <FamilyGroupSetupForm redirectTo="/shopping" />
      ) : (
        <div className="grid gap-5">
          <section className="rounded-[30px] border border-black/6 bg-white p-5 shadow-[0_24px_60px_-42px_rgba(17,24,39,0.35)] sm:p-6">
            <div className="space-y-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Indkøb
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Brug den visning, du har brug for lige nu
                </h1>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Skift mellem at lægge varer ind, styre dine lister og bruge den rene handlevisning.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { key: "add", label: "Tilføj ny vare" },
                  { key: "lists", label: "Indkøbslister" },
                  { key: "shop", label: "Handlevisning" },
                ].map((tab) => (
                  <a
                    key={tab.key}
                    href={`/shopping?view=${tab.key}&${baseQuery}`}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      viewMode === tab.key
                        ? "bg-[#153d32] text-white"
                        : "border border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {tab.label}
                  </a>
                ))}
              </div>
            </div>
          </section>

          {viewMode === "add" ? (
            <section className="rounded-[30px] border border-black/6 bg-white p-5 shadow-[0_24px_60px_-42px_rgba(17,24,39,0.35)] sm:p-6">
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Tilføj ny vare
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    Læg nye varer ind
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Her lægger du nye varer ind på den aktive indkøbsliste.
                  </p>
                </div>

                <ShoppingItemForm
                  mealPlans={family.mealPlans}
                  shoppingListId={family.activeShoppingListId}
                  shoppingListLabel={family.activeShoppingListName}
                  redirectTo={`/shopping?view=add&${baseQuery}`}
                />
              </div>
            </section>
          ) : null}

          {viewMode === "lists" ? (
            <section className="rounded-[30px] border border-black/6 bg-white p-5 shadow-[0_24px_60px_-42px_rgba(17,24,39,0.35)] sm:p-6">
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Indkøbslister
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    Skift eller opret en liste
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Hold hverdagsindkøb og særlige arrangementer adskilt.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {family.shoppingLists.map((list) => (
                    <a
                      key={list.id}
                      href={`/shopping?view=lists&list=${list.id}&sort=${sortMode}`}
                      className={`rounded-full px-4 py-2 text-sm transition ${
                        list.id === family.activeShoppingListId
                          ? "bg-[#153d32] text-white"
                          : "border border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {list.name}
                      {list.isPrimary ? " · Husholdning" : ""}
                    </a>
                  ))}
                </div>

                <form action={createShoppingListAction} className="flex flex-col gap-3 sm:flex-row">
                  <input type="hidden" name="redirectTo" value={`/shopping?view=lists&${baseQuery}`} />
                  <input
                    name="name"
                    type="text"
                    required
                    placeholder="Nyt listenavn, fx: Studenterfest"
                    className="h-12 flex-1 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-[#153d32] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#205949]"
                  >
                    Opret liste
                  </button>
                </form>
              </div>
            </section>
          ) : null}

          {viewMode === "shop" ? (
            <section className="rounded-[30px] border border-black/6 bg-white p-5 shadow-[0_24px_60px_-42px_rgba(17,24,39,0.35)] sm:p-6">
              <div className="mb-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Handlevisning
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Brug listen i butikken
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Her er kun fokus på selve indkøbslisten. Du kan markere varer som købt og ændre
                  rækkefølgen i manuel visning.
                </p>
              </div>

              <ShoppingList
                items={family.shoppingItems}
                shoppingLists={family.shoppingLists}
                activeListId={family.activeShoppingListId}
                activeListName={family.activeShoppingListName ?? activeList?.name ?? null}
                sortMode={sortMode}
                redirectTo={`/shopping?view=shop&${baseQuery}`}
              />
            </section>
          ) : null}
        </div>
      )}
    </AppFrame>
  );
}
