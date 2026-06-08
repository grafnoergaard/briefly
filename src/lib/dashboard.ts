import { format } from "date-fns";

import { ensureShoppingListsForFamilyGroup, isLegacyShoppingListId } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DashboardSnapshot, IntegrationConnection } from "@/lib/types";

const emptySnapshot: DashboardSnapshot = {
  familyGroupId: null,
  profileName: null,
  profileEmail: null,
  familyGroupName: null,
  connectedProviders: [],
  calendarEventCount: 0,
  taskCount: 0,
  openShoppingItemCount: 0,
  latestMealPlan: null,
};

export async function getDashboardSnapshot(userId: string): Promise<DashboardSnapshot> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return emptySnapshot;
  }

  const [
    profileResult,
    membershipResult,
    integrationsResult,
    calendarResult,
    tasksResult,
    mealPlanResult,
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    supabase
      .from("family_group_members")
      .select("family_group_id, family_groups(name)")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("integration_accounts")
      .select("provider, status, last_synced_at")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true }),
    supabase.from("calendar_events_cache").select("*", { count: "exact", head: true }).eq("profile_id", userId),
    supabase.from("tasks_cache").select("*", { count: "exact", head: true }).eq("profile_id", userId),
    supabase
      .from("meal_plans")
      .select("title, planned_for")
      .gte("planned_for", format(new Date(), "yyyy-MM-dd"))
      .order("planned_for", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const familyGroupName = getFamilyGroupName(membershipResult.data);
  const familyGroupId = membershipResult.data?.family_group_id ?? null;
  let openShoppingItemCount = 0;

  if (familyGroupId) {
    const shoppingLists = await ensureShoppingListsForFamilyGroup({
      supabase,
      familyGroupId,
      userId,
    });
    const primaryListId = shoppingLists.find((list) => list.isPrimary)?.id ?? shoppingLists[0]?.id ?? null;

    if (primaryListId) {
      const shoppingQuery = supabase
        .from("shopping_items")
        .select("*", { count: "exact", head: true })
        .eq("is_completed", false);
      const shoppingResult = isLegacyShoppingListId(primaryListId)
        ? await shoppingQuery.eq("family_group_id", familyGroupId)
        : await shoppingQuery.eq("shopping_list_id", primaryListId);

      if (!shoppingResult.error) {
        openShoppingItemCount = shoppingResult.count ?? 0;
      }
    }
  }

  return {
    familyGroupId,
    profileName: profileResult.data?.full_name ?? null,
    profileEmail: profileResult.data?.email ?? null,
    familyGroupName,
    connectedProviders: (integrationsResult.data ?? []).map((item) => ({
      provider: item.provider,
      status: item.status as IntegrationConnection["status"],
      lastSyncedAt: item.last_synced_at,
    })),
    calendarEventCount: calendarResult.count ?? 0,
    taskCount: tasksResult.count ?? 0,
    openShoppingItemCount,
    latestMealPlan: mealPlanResult.data
      ? {
          title: mealPlanResult.data.title,
          plannedFor: mealPlanResult.data.planned_for,
        }
      : null,
  };
}

function getFamilyGroupName(
  membership:
    | {
        family_groups?: { name?: string | null } | { name?: string | null }[] | null;
      }
    | null
    | undefined,
) {
  if (!membership?.family_groups) {
    return null;
  }

  const group = Array.isArray(membership.family_groups)
    ? membership.family_groups[0]
    : membership.family_groups;

  return group?.name ?? null;
}
