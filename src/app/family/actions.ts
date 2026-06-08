"use server";

import { addDays, format, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inferShoppingCategory } from "@/features/family/lib/shopping-categories";
import { ensureShoppingListsForFamilyGroup, isLegacyShoppingListId } from "@/lib/family";
import { slugify } from "@/lib/utils";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createFamilyGroupAction(formData: FormData) {
  const { user, supabase } = await requireActionUser();
  const name = String(formData.get("name") ?? "").trim();
  const redirectTo = getRedirectTarget(formData, "/meal-plan");

  if (!name) {
    redirectError(new Error("Der mangler et navn til familiegruppen."), "Der mangler et navn til familiegruppen.");
  }

  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

  const { data: familyGroup, error: familyGroupError } = await supabase
    .from("family_groups")
    .insert({
      name,
      slug,
      owner_id: user.id,
    })
    .select("id, name")
    .single();

  if (familyGroupError || !familyGroup) {
    redirectError(familyGroupError, "Kunne ikke oprette familiegruppen.");
  }

  const { error: membershipError } = await supabase.from("family_group_members").insert({
    family_group_id: familyGroup.id,
    profile_id: user.id,
    role: "owner",
  });

  if (membershipError) {
    redirectError(membershipError, "Kunne ikke forbinde dig til familiegruppen.");
  }

  await logFamilyActivity(supabase, {
    familyGroupId: familyGroup.id,
    actorId: user.id,
    entityType: "family_group",
    summary: `${getActorName(user)} oprettede ${familyGroup.name}.`,
  });

  await ensureShoppingListsForFamilyGroup({
    supabase,
    familyGroupId: familyGroup.id,
    userId: user.id,
  });

  revalidateFamilyViews();
  redirectSuccess(`${familyGroup.name} er oprettet.`, redirectTo);
}

export async function createShoppingListAction(formData: FormData) {
  const { user, supabase, familyGroupId } = await requireFamilyActionContext();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirectError(new Error("Der mangler et navn til indkøbslisten."), "Der mangler et navn til indkøbslisten.");
  }

  const existingLists = await ensureShoppingListsForFamilyGroup({
    supabase,
    familyGroupId,
    userId: user.id,
  });

  if (existingLists.some((list) => isLegacyShoppingListId(list.id))) {
    redirectError(
      new Error("Shopping lists migration is missing."),
      "Kør den nyeste Supabase-migration, før du opretter separate indkøbslister.",
    );
  }

  const baseSlug = slugify(name) || "list";
  let slug = baseSlug;
  let counter = 2;

  while (existingLists.some((list) => list.slug === slug)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  const { data: shoppingList, error } = await supabase
    .from("shopping_lists")
    .insert({
      family_group_id: familyGroupId,
      name,
      slug,
      is_primary: false,
      created_by: user.id,
    })
    .select("id, name")
    .single();

  if (error || !shoppingList) {
    redirectError(error, "Kunne ikke oprette indkøbslisten.");
  }

  await logFamilyActivity(supabase, {
    familyGroupId,
    actorId: user.id,
    entityType: "shopping_list",
    entityId: shoppingList.id,
    summary: `${getActorName(user)} oprettede indkøbslisten ${shoppingList.name}.`,
  });

  revalidateFamilyViews();
  redirectSuccess(`${shoppingList.name} er oprettet.`, `/shopping?list=${shoppingList.id}`);
}

export async function createMealPlanAction(formData: FormData) {
  const { user, supabase, familyGroupId } = await requireFamilyActionContext();
  const redirectTo = getRedirectTarget(formData, "/meal-plan");
  const title = String(formData.get("title") ?? "").trim();
  const plannedFor = resolveMealPlanDate(formData);
  const notes = String(formData.get("notes") ?? "").trim();

  if (!title || !plannedFor) {
    redirectError(new Error("Der mangler titel eller dato til madplanen."), "Der mangler data til madplanen.");
  }

  const { data: mealPlan, error } = await supabase
    .from("meal_plans")
    .upsert(
      {
        family_group_id: familyGroupId,
        planned_for: plannedFor,
        title,
        notes: notes || null,
        created_by: user.id,
      },
      {
        onConflict: "family_group_id,planned_for",
      },
    )
    .select("id, title, planned_for")
    .single();

  if (error || !mealPlan) {
    redirectError(error, "Kunne ikke gemme madplanen.");
  }

  await logFamilyActivity(supabase, {
    familyGroupId,
    actorId: user.id,
    entityType: "meal_plan",
    entityId: mealPlan.id,
    summary: `${getActorName(user)} lagde ${mealPlan.title} ind til ${mealPlan.planned_for}.`,
  });

  revalidateFamilyViews();
  redirectSuccess(`${mealPlan.title} er gemt i madplanen.`, redirectTo);
}

function resolveMealPlanDate(formData: FormData) {
  const directDate = String(formData.get("plannedFor") ?? "").trim();

  if (directDate) {
    return directDate;
  }

  const weekStart = String(formData.get("weekStart") ?? "").trim();
  const dayOffset = Number(String(formData.get("dayOffset") ?? "").trim());

  if (!weekStart || Number.isNaN(dayOffset) || dayOffset < 0 || dayOffset > 6) {
    return "";
  }

  return format(addDays(parseISO(weekStart), dayOffset), "yyyy-MM-dd");
}

export async function addShoppingItemAction(formData: FormData) {
  const { user, supabase, familyGroupId } = await requireFamilyActionContext();
  const redirectTo = getRedirectTarget(formData, "/shopping");
  const label = String(formData.get("label") ?? "").trim();
  const quantity = String(formData.get("quantity") ?? "").trim();
  const categoryInput = String(formData.get("category") ?? "").trim();
  const mealPlanId = String(formData.get("mealPlanId") ?? "").trim();
  const shoppingListId = String(formData.get("shoppingListId") ?? "").trim();

  if (!label) {
    redirectError(new Error("Der mangler et navn på varen."), "Der mangler et navn på varen.");
  }

  const category = categoryInput || inferShoppingCategory(label);
  const resolvedShoppingLists = await ensureShoppingListsForFamilyGroup({
    supabase,
    familyGroupId,
    userId: user.id,
  });
  const resolvedShoppingListId =
    shoppingListId ||
    resolvedShoppingLists.find((list) => list.isPrimary)?.id ||
    resolvedShoppingLists[0]?.id ||
    "";

  if (!resolvedShoppingListId) {
    redirectError(new Error("Der er ingen indkøbsliste tilgængelig."), "Der er ingen indkøbsliste tilgængelig.");
  }

  const { data: existingItems, error: existingItemsError } = await supabase
    .from("shopping_items")
    .select("sort_index")
    .eq("family_group_id", familyGroupId)
    .eq("shopping_list_id", resolvedShoppingListId)
    .eq("is_completed", false)
    .order("sort_index", { ascending: false })
    .limit(1);

  if (existingItemsError) {
    redirectError(existingItemsError, "Kunne ikke læse rækkefølgen på indkøbslisten.");
  }

  const nextSortIndex = (existingItems?.[0]?.sort_index ?? 0) + 100;

  const { data: item, error } = await supabase
    .from("shopping_items")
    .insert({
      family_group_id: familyGroupId,
      added_by: user.id,
      shopping_list_id: resolvedShoppingListId,
      label,
      quantity: quantity || null,
      category: category || null,
      meal_plan_id: mealPlanId || null,
      sort_index: nextSortIndex,
    })
    .select("id, label, quantity, category")
    .single();

  if (error || !item) {
    redirectError(error, "Kunne ikke tilføje varen.");
  }

  await logFamilyActivity(supabase, {
    familyGroupId,
    actorId: user.id,
    entityType: "shopping_item",
    entityId: item.id,
    summary: `${getActorName(user)} tilføjede ${item.label}${item.quantity ? ` (${item.quantity})` : ""}${item.category ? ` til ${item.category}.` : "."}`,
  });

  revalidateFamilyViews();
  redirectSuccess(`${item.label} er tilføjet til indkøbslisten.`, redirectTo);
}

export async function toggleShoppingItemAction(formData: FormData) {
  const { user, supabase, familyGroupId } = await requireFamilyActionContext();
  const redirectTo = getRedirectTarget(formData, "/shopping");
  const itemId = String(formData.get("itemId") ?? "").trim();
  const completed = String(formData.get("completed") ?? "") === "true";
  const label = String(formData.get("label") ?? "").trim();
  const shoppingListId = String(formData.get("shoppingListId") ?? "").trim();
  const resolvedShoppingLists = await ensureShoppingListsForFamilyGroup({
    supabase,
    familyGroupId,
    userId: user.id,
  });
  const resolvedShoppingListId =
    shoppingListId ||
    resolvedShoppingLists.find((list) => list.isPrimary)?.id ||
    resolvedShoppingLists[0]?.id ||
    "";

  if (!itemId) {
    redirectError(new Error("Der mangler id på varen."), "Der mangler data til varen.");
  }

  const { error } = await supabase
    .from("shopping_items")
    .update({
      is_completed: completed,
      sort_index:
        completed
          ? 999999
          : await getNextOpenShoppingSortIndex(supabase, familyGroupId, resolvedShoppingListId),
    })
    .eq("id", itemId);

  if (error) {
    redirectError(error, "Kunne ikke opdatere varen.");
  }

  await logFamilyActivity(supabase, {
    familyGroupId,
    actorId: user.id,
    entityType: "shopping_item",
    entityId: itemId,
    summary: `${getActorName(user)} ${completed ? "markerede som købt" : "åbnede igen"} ${label || "en vare"}.`,
  });

  revalidateFamilyViews();
  redirectSuccess(completed ? "Varen er markeret som købt." : "Varen er åben igen.", redirectTo);
}

export async function moveShoppingItemAction(formData: FormData) {
  const { user, supabase, familyGroupId } = await requireFamilyActionContext();
  const redirectTo = getRedirectTarget(formData, "/shopping");
  const itemId = String(formData.get("itemId") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  const shoppingListId = String(formData.get("shoppingListId") ?? "").trim();
  const resolvedShoppingLists = await ensureShoppingListsForFamilyGroup({
    supabase,
    familyGroupId,
    userId: user.id,
  });
  const resolvedShoppingListId =
    shoppingListId ||
    resolvedShoppingLists.find((list) => list.isPrimary)?.id ||
    resolvedShoppingLists[0]?.id ||
    "";

  if (!itemId || !["up", "down"].includes(direction)) {
    redirectError(new Error("Ugyldig ændring af rækkefølgen på indkøbslisten."), "Ugyldig ændring af rækkefølgen på indkøbslisten.");
  }

  const { data: items, error } = await supabase
    .from("shopping_items")
    .select("id, sort_index")
    .eq("family_group_id", familyGroupId)
    .eq("shopping_list_id", resolvedShoppingListId)
    .eq("is_completed", false)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !items) {
    redirectError(error, "Kunne ikke læse rækkefølgen på indkøbslisten.");
  }

  const currentIndex = items.findIndex((item) => item.id === itemId);
  const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || swapIndex < 0 || swapIndex >= items.length) {
    redirect(redirectTo);
  }

  const currentItem = items[currentIndex];
  const swapItem = items[swapIndex];

  const { error: currentUpdateError } = await supabase
    .from("shopping_items")
    .update({ sort_index: swapItem.sort_index })
    .eq("id", currentItem.id);

  if (currentUpdateError) {
    redirectError(currentUpdateError, "Kunne ikke ændre rækkefølgen på indkøbslisten.");
  }

  const { error: swapUpdateError } = await supabase
    .from("shopping_items")
    .update({ sort_index: currentItem.sort_index })
    .eq("id", swapItem.id);

  if (swapUpdateError) {
    redirectError(swapUpdateError, "Kunne ikke ændre rækkefølgen på indkøbslisten.");
  }

  revalidateFamilyViews();
  redirect(redirectTo);
}

export async function reorderShoppingItemsAction(formData: FormData) {
  const { supabase, familyGroupId } = await requireFamilyActionContext();
  const orderedIdsRaw = String(formData.get("orderedIds") ?? "").trim();
  const shoppingListId = String(formData.get("shoppingListId") ?? "").trim();

  if (!orderedIdsRaw) {
    throw new Error("Der mangler en ny rækkefølge.");
  }

  let orderedIds: string[] = [];

  try {
    const parsed = JSON.parse(orderedIdsRaw) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("Ugyldig rækkefølge.");
    }

    orderedIds = parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    throw new Error("Ugyldig rækkefølge.");
  }

  if (orderedIds.length === 0) {
    throw new Error("Rækkefølgen var tom.");
  }

  const selectQuery = supabase
    .from("shopping_items")
    .select("id")
    .eq("family_group_id", familyGroupId)
    .eq("is_completed", false)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: existingItems, error } = isLegacyShoppingListId(shoppingListId)
    ? await selectQuery
    : await selectQuery.eq("shopping_list_id", shoppingListId);

  if (error || !existingItems) {
    throw new Error(error?.message ?? "Kunne ikke læse indkøbslisten.");
  }

  const existingIds = existingItems.map((item) => item.id);

  if (
    existingIds.length !== orderedIds.length ||
    existingIds.some((id) => !orderedIds.includes(id))
  ) {
    throw new Error("Indkøbslisten ændrede sig, mens du sorterede. Prøv igen.");
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    const itemId = orderedIds[index];
    const nextSortIndex = (index + 1) * 100;
    const { error: updateError } = await supabase
      .from("shopping_items")
      .update({ sort_index: nextSortIndex })
      .eq("id", itemId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidateFamilyViews();

  return { ok: true };
}

export async function clearCompletedShoppingItemsAction(formData: FormData) {
  const { supabase, familyGroupId } = await requireFamilyActionContext();
  const redirectTo = getRedirectTarget(formData, "/shopping");
  const shoppingListId = String(formData.get("shoppingListId") ?? "").trim();

  const deleteQuery = supabase
    .from("shopping_items")
    .delete()
    .eq("family_group_id", familyGroupId)
    .eq("is_completed", true);

  const { error } = isLegacyShoppingListId(shoppingListId)
    ? await deleteQuery
    : await deleteQuery.eq("shopping_list_id", shoppingListId);

  if (error) {
    redirectError(error, "Kunne ikke rydde de købte varer.");
  }

  revalidateFamilyViews();
  redirectSuccess("De købte varer er ryddet.", redirectTo);
}

async function requireActionUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/shopping?sync=error&message=Supabase-milj%C3%B8variabler%20mangler.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return { user, supabase };
}

async function requireFamilyActionContext() {
  const { user, supabase } = await requireActionUser();
  const { data } = await supabase
    .from("family_group_members")
    .select("family_group_id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!data?.family_group_id) {
    redirectError(new Error("Opret en familiegruppe, før du tilføjer madplaner eller indkøb."), "Der er ingen familiegruppe forbundet.");
  }

  return {
    user,
    supabase,
    familyGroupId: data.family_group_id,
  };
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

function revalidateFamilyViews() {
  revalidatePath("/");
  revalidatePath("/meal-plan");
  revalidatePath("/shopping");
}

function redirectSuccess(message: string, redirectTo = "/shopping"): never {
  redirect(`${redirectTo}?sync=success&message=${encodeURIComponent(message)}`);
}

function redirectError(error: unknown, fallback: string): never {
  const message = error instanceof Error ? error.message : fallback;
  redirect(`/shopping?sync=error&message=${encodeURIComponent(message)}`);
}

function getRedirectTarget(formData: FormData, fallback: string) {
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();

  if (!redirectTo.startsWith("/meal-plan") && !redirectTo.startsWith("/shopping")) {
    return fallback;
  }

  return redirectTo || fallback;
}

async function getNextOpenShoppingSortIndex(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  familyGroupId: string,
  shoppingListId: string,
) {
  const { data } = await supabase
    .from("shopping_items")
    .select("sort_index")
    .eq("family_group_id", familyGroupId)
    .eq("shopping_list_id", shoppingListId)
    .eq("is_completed", false)
    .order("sort_index", { ascending: false })
    .limit(1);

  return (data?.[0]?.sort_index ?? 0) + 100;
}

function getActorName(user: { user_metadata?: Record<string, unknown> | null; email?: string | null }) {
  const metadata = user.user_metadata ?? {};
  const name = metadata.full_name ?? metadata.name;

  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  return user.email ?? "Nogen";
}
