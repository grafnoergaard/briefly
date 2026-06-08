import { Card, CardContent } from "@/components/ui/card";
import {
  clearCompletedShoppingItemsAction,
  createShoppingListAction,
} from "@/app/family/actions";
import { AppFrame } from "@/features/navigation/components/app-frame";
import { FamilyGroupSetupForm } from "@/features/family/components/family-group-setup-form";
import { ShoppingItemForm } from "@/features/family/components/shopping-item-form";
import { ShoppingList } from "@/features/family/components/shopping-list";
import { ShoppingSortControls } from "@/features/family/components/shopping-sort-controls";
import { requireUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getFamilyWorkspaceData } from "@/lib/family";

type ShoppingPageProps = {
  searchParams: Promise<{
    sort?: string;
    sync?: string;
    message?: string;
    list?: string;
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
  const openItemCount = family.shoppingItems.filter((item) => !item.isCompleted).length;
  const completedItemCount = family.shoppingItems.length - openItemCount;
  const activeList = family.shoppingLists.find((list) => list.id === family.activeShoppingListId) ?? null;
  const currentRedirectTarget = `/shopping?list=${family.activeShoppingListId ?? ""}&sort=${sortMode}`;

  return (
    <AppFrame currentPath="/shopping" userLabel={snapshot.familyGroupName ?? user.email}>
      <div className="grid gap-4">
        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
              Indkøb
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
              Tag én tydelig indkøbstur ad gangen
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Vælg den liste, du faktisk handler fra, tilføj det der mangler, og markér varer som
              købt, mens du bevæger dig gennem butikken.
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

            {!family.familyGroupId ? (
              <FamilyGroupSetupForm redirectTo="/shopping" />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[24px] border border-border/70 bg-white/75 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Mangler nu
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{openItemCount}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activeList ? `Mangler stadig på ${activeList.name}.` : "Mangler stadig på denne tur."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-border/70 bg-white/75 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Aktuel liste
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                      {activeList?.name ?? "Ingen liste"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activeList?.isPrimary
                        ? "Det er den daglige husholdningsliste, som Hjem og AI bruger som standard."
                        : "Denne liste holdes adskilt fra den almindelige husholdningsliste."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-border/70 bg-white/75 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Købt
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{completedItemCount}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Allerede markeret som købt på denne liste.
                    </p>
                    {completedItemCount > 0 ? (
                      <form action={clearCompletedShoppingItemsAction} className="mt-4">
                        <input type="hidden" name="redirectTo" value={currentRedirectTarget} />
                        <input type="hidden" name="shoppingListId" value={family.activeShoppingListId ?? ""} />
                        <button
                          type="submit"
                          className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-muted"
                        >
                          Ryd købte
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>

                <div>
                  <ShoppingItemForm
                    mealPlans={family.mealPlans}
                    shoppingListId={family.activeShoppingListId}
                    shoppingListLabel={family.activeShoppingListName}
                    redirectTo={currentRedirectTarget}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Handl nu
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  Tilføj varer og kryds dem af
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Manuel rækkefølge er bedst, når du kender din rute. Kategori-visning er bedst,
                  når du står i butikken.
                </p>
              </div>
              <ShoppingSortControls
                currentSort={sortMode}
                currentListId={family.activeShoppingListId}
              />
            </div>
            <div className="mt-6">
              <ShoppingList
                items={family.shoppingItems}
                listName={family.activeShoppingListName}
                sortMode={sortMode}
                redirectTo={currentRedirectTarget}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="p-6 sm:p-8">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Indkøbslister
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                Hold særlige arrangementer væk fra hverdagsindkøbet
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Brug husholdningslisten til hverdagens indkøb, og opret særskilte lister til
                studenterfest, sommerhus eller andre enkeltstående begivenheder.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {family.shoppingLists.map((list) => (
                <a
                  key={list.id}
                  href={`/shopping?list=${list.id}&sort=${sortMode}`}
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

            <form action={createShoppingListAction} className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input type="hidden" name="redirectTo" value={`/shopping?sort=${sortMode}`} />
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
                Opret indkøbsliste
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  );
}
