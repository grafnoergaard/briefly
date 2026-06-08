import { Card, CardContent } from "@/components/ui/card";
import { AppFrame } from "@/features/navigation/components/app-frame";
import { FamilyGroupSetupForm } from "@/features/family/components/family-group-setup-form";
import { MealPlanForm } from "@/features/family/components/meal-plan-form";
import { MealPlanList } from "@/features/family/components/meal-plan-list";
import { requireUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getFamilyWorkspaceData } from "@/lib/family";

type MealPlanPageProps = {
  searchParams: Promise<{
    sync?: string;
    message?: string;
  }>;
};

export default async function MealPlanPage({ searchParams }: MealPlanPageProps) {
  const user = await requireUser();
  const snapshot = await getDashboardSnapshot(user.id);
  const family = await getFamilyWorkspaceData(user.id);
  const params = await searchParams;

  return (
    <AppFrame currentPath="/meal-plan" userLabel={snapshot.familyGroupName ?? user.email}>
      <div className="grid gap-4">
        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
              Madplan
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
              Planlæg ugen i én rolig kolonne
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Start med næste aftensmad og arbejd dig stille gennem ugen. Tilføj først ingredienser,
              når retten faktisk er besluttet.
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
              <FamilyGroupSetupForm redirectTo="/meal-plan" />
            ) : (
              <div>
                <MealPlanForm redirectTo="/meal-plan" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-black/5 bg-white/82">
          <CardContent className="p-6 sm:p-8">
            <MealPlanList
              mealPlans={family.mealPlans}
              shoppingItems={family.shoppingItems}
              shoppingListId={family.primaryShoppingListId}
              shoppingListLabel={family.activeShoppingListName}
              redirectTo="/meal-plan"
            />
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  );
}
