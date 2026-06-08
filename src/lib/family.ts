import { formatDistanceToNowStrict } from "date-fns";
import type { User } from "@supabase/supabase-js";

import { getCurrentDateContext } from "@/lib/date-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  FamilyActivityEntry,
  FamilyMealPlanEntry,
  ShoppingListSummary,
  ShoppingListEntry,
} from "@/lib/types";
import {
  inferShoppingCategory,
  normalizeShoppingCategory,
} from "@/features/family/lib/shopping-categories";

export type FamilyWorkspaceData = {
  familyGroupId: string | null;
  familyGroupName: string | null;
  shoppingLists: ShoppingListSummary[];
  primaryShoppingListId: string | null;
  activeShoppingListId: string | null;
  activeShoppingListName: string | null;
  activityFeed: FamilyActivityEntry[];
  mealPlans: FamilyMealPlanEntry[];
  shoppingItems: ShoppingListEntry[];
};

const LEGACY_SHOPPING_LIST_ID = "legacy-household";

export async function getFamilyWorkspaceData(
  userId: string,
  options?: {
    shoppingListId?: string | null;
  },
): Promise<FamilyWorkspaceData> {
  const supabase = await createSupabaseServerClient();
  const dateContext = getCurrentDateContext();

  if (!supabase) {
    return emptyFamilyWorkspace;
  }

  const membershipResult = await supabase
    .from("family_group_members")
    .select("family_group_id, family_groups(name)")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  const familyGroupId = membershipResult.data?.family_group_id ?? null;
  const familyGroupName = getFamilyGroupName(membershipResult.data);

  if (!familyGroupId) {
    return {
      ...emptyFamilyWorkspace,
      familyGroupName,
    };
  }

  const shoppingLists = await ensureShoppingListsForFamilyGroup({
    supabase,
    familyGroupId,
    userId,
  });
  const primaryShoppingList = shoppingLists.find((list) => list.isPrimary) ?? shoppingLists[0] ?? null;
  const activeShoppingList =
    shoppingLists.find((list) => list.id === options?.shoppingListId) ?? primaryShoppingList ?? null;

  const [activityResult, mealPlansResult] = await Promise.all([
    supabase
      .from("activity_feed")
      .select("id, summary, entity_type, created_at")
      .eq("family_group_id", familyGroupId)
      .gte("created_at", `${dateContext.weekStartIso}T00:00:00.000Z`)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("meal_plans")
      .select("id, title, planned_for, notes")
      .eq("family_group_id", familyGroupId)
      .gte("planned_for", dateContext.todayIso)
      .order("planned_for", { ascending: true })
      .limit(14),
  ]);

  const resolvedShoppingResult = isLegacyShoppingListId(activeShoppingList?.id)
    ? await supabase
        .from("shopping_items")
        .select("id, label, quantity, category, is_completed, meal_plan_id, sort_index, added_by")
        .eq("family_group_id", familyGroupId)
        .order("is_completed", { ascending: true })
        .order("sort_index", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50)
    : await supabase
        .from("shopping_items")
        .select("id, label, quantity, category, is_completed, meal_plan_id, sort_index, shopping_list_id, added_by")
        .eq("family_group_id", familyGroupId)
        .eq("shopping_list_id", activeShoppingList?.id ?? "")
      .order("is_completed", { ascending: true })
      .order("sort_index", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(50);

  const shoppingRows = ((resolvedShoppingResult.data as Array<Record<string, unknown>> | null) ?? []);
  const addedByIds = [
    ...new Set(
      shoppingRows
        .map((item) => item.added_by)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
  const addedByNameMap = new Map<string, string | null>();

  if (addedByIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", addedByIds);

    for (const profile of profiles ?? []) {
      addedByNameMap.set(profile.id, profile.full_name ?? profile.email ?? null);
    }
  }

  return {
    familyGroupId,
    familyGroupName,
    shoppingLists,
    primaryShoppingListId: primaryShoppingList?.id ?? null,
    activeShoppingListId: activeShoppingList?.id ?? null,
    activeShoppingListName: activeShoppingList?.name ?? null,
    activityFeed: (activityResult.data ?? []).map((entry) => ({
      id: entry.id,
      summary: entry.summary,
      entityType: entry.entity_type,
      createdAt: formatDistanceToNowStrict(new Date(entry.created_at), { addSuffix: true }),
    })),
    mealPlans: (mealPlansResult.data ?? []).map((plan) => ({
      id: plan.id,
      title: plan.title,
      plannedFor: plan.planned_for,
      notes: plan.notes,
    })),
    shoppingItems: shoppingRows.map((item) => ({
      id: String(item.id ?? ""),
      label: String(item.label ?? ""),
      quantity: (item.quantity as string | null) ?? null,
      category: normalizeShoppingCategory((item.category as string | null) ?? null) ?? ((item.category as string | null) ?? null),
      isCompleted: Boolean(item.is_completed),
      mealPlanId: (item.meal_plan_id as string | null) ?? null,
      sortIndex: Number(item.sort_index ?? 0),
      shoppingListId:
        (item.shopping_list_id as string | undefined) ??
        activeShoppingList?.id ??
        LEGACY_SHOPPING_LIST_ID,
      addedByName:
        typeof item.added_by === "string"
          ? addedByNameMap.get(item.added_by) ?? null
          : null,
    })),
  };
}

export async function createMealPlanEntry(input: {
  user: User;
  title: string;
  plannedFor: string;
  notes?: string | null;
  shoppingItems?: Array<{
    label: string;
    quantity?: string | null;
    category?: string | null;
  }>;
}) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  const familyGroupId = await requireFamilyGroupId(supabase, input.user.id);
  const primaryShoppingListId = await requirePrimaryShoppingListId(supabase, familyGroupId, input.user.id);
  const { data: mealPlan, error } = await supabase
    .from("meal_plans")
    .upsert(
      {
        family_group_id: familyGroupId,
        planned_for: input.plannedFor,
        title: input.title,
        notes: input.notes?.trim() || null,
        created_by: input.user.id,
      },
      {
        onConflict: "family_group_id,planned_for",
      },
    )
    .select("id, title, planned_for")
    .single();

  if (error || !mealPlan) {
    throw new Error(error?.message ?? "Saving the meal plan failed.");
  }

  let linkedShoppingCount = 0;

  if (input.shoppingItems && input.shoppingItems.length > 0) {
    const shoppingResult = await addShoppingItems({
      user: input.user,
      items: input.shoppingItems,
      mealPlanId: mealPlan.id,
      shoppingListId: primaryShoppingListId,
    });
    linkedShoppingCount = shoppingResult.items.length;
  }

  await logFamilyActivity(supabase, {
    familyGroupId,
    actorId: input.user.id,
    entityType: "meal_plan",
    entityId: mealPlan.id,
    summary: `${getActorName(input.user)} planned ${mealPlan.title} for ${mealPlan.planned_for}.`,
  });

  return {
    id: mealPlan.id,
    title: mealPlan.title,
    plannedFor: mealPlan.planned_for,
    linkedShoppingCount,
  };
}

export async function addShoppingItems(input: {
  user: User;
  items: Array<{
    label: string;
    quantity?: string | null;
    category?: string | null;
  }>;
  mealPlanId?: string | null;
  shoppingListId?: string | null;
}) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  const familyGroupId = await requireFamilyGroupId(supabase, input.user.id);
  const shoppingListId =
    input.shoppingListId ?? (await requirePrimaryShoppingListId(supabase, familyGroupId, input.user.id));
  const preparedItems = input.items
    .map((item) => ({
      label: item.label.trim(),
      quantity: item.quantity?.trim() || null,
      category: item.category?.trim() || inferShoppingCategory(item.label),
    }))
    .filter((item) => item.label.length > 0);

  if (preparedItems.length === 0) {
    throw new Error("At least one shopping item is required.");
  }

  const existingItemsQuery = supabase
    .from("shopping_items")
    .select("sort_index")
    .eq("family_group_id", familyGroupId)
    .eq("is_completed", false)
    .order("sort_index", { ascending: false })
    .limit(1);
  const { data: existingItems, error: existingItemsError } = isLegacyShoppingListId(shoppingListId)
    ? await existingItemsQuery
    : await existingItemsQuery.eq("shopping_list_id", shoppingListId);

  if (existingItemsError) {
    throw new Error(existingItemsError.message);
  }

  const startSortIndex = (existingItems?.[0]?.sort_index ?? 0) + 100;
  const rows = preparedItems.map((item, index) => ({
    family_group_id: familyGroupId,
    added_by: input.user.id,
    ...(isLegacyShoppingListId(shoppingListId) ? {} : { shopping_list_id: shoppingListId }),
    label: item.label,
    quantity: item.quantity,
    category: item.category || null,
    meal_plan_id: input.mealPlanId || null,
    sort_index: startSortIndex + index * 100,
  }));

  const { data: insertedItems, error } = await supabase
    .from("shopping_items")
    .insert(rows)
    .select("id, label, quantity, category");

  if (error || !insertedItems) {
    throw new Error(error?.message ?? "Adding shopping items failed.");
  }

  await Promise.all(
    insertedItems.map((item) =>
      logFamilyActivity(supabase, {
        familyGroupId,
        actorId: input.user.id,
        entityType: "shopping_item",
        entityId: item.id,
        summary: `${getActorName(input.user)} added ${item.label}${item.quantity ? ` (${item.quantity})` : ""}${item.category ? ` to ${item.category}.` : "."}`,
      }),
    ),
  );

  return {
    items: insertedItems.map((item) => ({
      id: item.id,
      label: item.label,
      quantity: item.quantity,
      category: item.category,
    })),
  };
}

const emptyFamilyWorkspace: FamilyWorkspaceData = {
  familyGroupId: null,
  familyGroupName: null,
  shoppingLists: [],
  primaryShoppingListId: null,
  activeShoppingListId: null,
  activeShoppingListName: null,
  activityFeed: [],
  mealPlans: [],
  shoppingItems: [],
};

export async function ensureShoppingListsForFamilyGroup(input: {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  familyGroupId: string;
  userId: string;
}): Promise<ShoppingListSummary[]> {
  const { supabase, familyGroupId, userId } = input;
  const { data: existingLists, error } = await supabase
    .from("shopping_lists")
    .select("id, name, slug, is_primary")
    .eq("family_group_id", familyGroupId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingShoppingListsSchemaError(error)) {
      return [legacyHouseholdShoppingList];
    }

    throw new Error(error.message);
  }

  if (existingLists && existingLists.length > 0) {
    return existingLists.map((list) => ({
      id: list.id,
      name: list.name,
      slug: list.slug,
      isPrimary: list.is_primary,
    }));
  }

  const { data: insertedList, error: insertError } = await supabase
    .from("shopping_lists")
    .insert({
      family_group_id: familyGroupId,
      name: "Household",
      slug: "household",
      is_primary: true,
      created_by: userId,
    })
    .select("id, name, slug, is_primary")
    .single();

  if (insertError || !insertedList) {
    throw new Error(insertError?.message ?? "Creating the default shopping list failed.");
  }

  return [
    {
      id: insertedList.id,
      name: insertedList.name,
      slug: insertedList.slug,
      isPrimary: insertedList.is_primary,
    },
  ];
}

async function requireFamilyGroupId(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  userId: string,
) {
  const { data } = await supabase
    .from("family_group_members")
    .select("family_group_id")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  if (!data?.family_group_id) {
    throw new Error("Create a family group before adding meals or shopping items.");
  }

  return data.family_group_id;
}

async function requirePrimaryShoppingListId(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  familyGroupId: string,
  userId: string,
) {
  const lists = await ensureShoppingListsForFamilyGroup({
    supabase,
    familyGroupId,
    userId,
  });
  const primaryList = lists.find((list) => list.isPrimary) ?? lists[0];

  if (!primaryList) {
    throw new Error("No shopping list is available for this family.");
  }

  return primaryList.id;
}

export function isLegacyShoppingListId(value: string | null | undefined) {
  return !value || value === LEGACY_SHOPPING_LIST_ID;
}

function isMissingShoppingListsSchemaError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message?.includes("public.shopping_lists"));
}

const legacyHouseholdShoppingList: ShoppingListSummary = {
  id: LEGACY_SHOPPING_LIST_ID,
  name: "Household",
  slug: "household",
  isPrimary: true,
};

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

async function logFamilyActivity(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  input: {
    familyGroupId: string;
    actorId: string;
    entityType: string;
    entityId?: string;
    summary: string;
  },
) {
  await supabase.from("activity_feed").insert({
    family_group_id: input.familyGroupId,
    actor_id: input.actorId,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    summary: input.summary,
  });
}

function getActorName(user: User) {
  const metadata = user.user_metadata ?? {};
  return metadata.full_name ?? metadata.name ?? user.email ?? "Someone";
}
