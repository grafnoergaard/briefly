import { addDays, formatISO, subDays } from "date-fns";
import type { User } from "@supabase/supabase-js";

import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { getValidGoogleAccessToken } from "@/features/integrations/google/google-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GOOGLE_PROVIDER = "google";
const GOOGLE_CALENDAR_PROVIDER = "google_calendar";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const PREFERRED_GOOGLE_CALENDAR_NAME = "Vores kalender";
const DEFAULT_EVENT_DURATION_MINUTES = 60;

type CalendarSyncResult = {
  calendarNames: string[];
  syncedCount: number;
  deletedCount: number;
};

type CachedCalendarEventRow = {
  profile_id: string;
  family_group_id: string | null;
  provider: string;
  external_id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: string | null;
  is_all_day: boolean;
  payload: GoogleCalendarApiEvent;
  synced_at: string;
};

type GoogleCalendarApiEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
};

type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  primary?: boolean;
};

type IntegrationAccountMetadataRow = {
  metadata?: Record<string, unknown> | null;
};

export type GoogleCalendarChoice = {
  id: string;
  summary: string;
  isPrimary: boolean;
  isSelected: boolean;
};

type GoogleCalendarCreateEventInput = {
  userId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string | null;
  location?: string | null;
  isAllDay?: boolean;
  calendarId?: string | null;
};

export type GoogleCalendarCreatedEvent = {
  calendarId: string;
  calendarName: string;
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
};

export async function persistGoogleOAuthSession(params: {
  userId: string;
  email: string | null;
  providerAccountId: string | null;
  scopes: string[];
  providerToken: string | null;
  providerRefreshToken: string | null;
  expiresAt: number | null;
}) {
  if (!hasSupabaseAdminEnv()) {
    return;
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { error: accountError } = await admin.from("integration_accounts").upsert(
    [
      {
        profile_id: params.userId,
        provider: GOOGLE_PROVIDER,
        provider_account_id: params.providerAccountId ?? params.email,
        scopes: params.scopes,
        status: params.providerToken ? "connected" : "pending",
        metadata: {
          email: params.email,
          lastTokenCaptureAt: now,
        },
        updated_at: now,
      },
    ] as never,
    {
      onConflict: "profile_id,provider",
    },
  );

  if (accountError) {
    throw new Error(`Failed to persist Google integration account: ${accountError.message}`);
  }

  if (params.providerToken || params.providerRefreshToken) {
    const { error: tokenError } = await admin.from("integration_account_tokens").upsert(
      [
        {
          profile_id: params.userId,
          provider: GOOGLE_PROVIDER,
          access_token: params.providerToken,
          refresh_token: params.providerRefreshToken,
          expires_at: params.expiresAt
            ? new Date(params.expiresAt * 1000).toISOString()
            : null,
          scope: params.scopes.join(" "),
          updated_at: now,
        },
      ] as never,
      {
        onConflict: "profile_id,provider",
      },
    );

    if (tokenError) {
      throw new Error(`Failed to persist Google integration tokens: ${tokenError.message}`);
    }
  }
}

export async function ensureProfileFromAuthUser(user: User) {
  if (!hasSupabaseAdminEnv()) {
    return;
  }

  const admin = createSupabaseAdminClient();
  const metadata = user.user_metadata ?? {};
  const { error } = await admin.from("profiles").upsert(
    [
      {
        id: user.id,
        email: user.email ?? null,
        full_name: metadata.full_name ?? metadata.name ?? null,
        avatar_url: metadata.avatar_url ?? null,
      },
    ] as never,
    {
      onConflict: "id",
    },
  );

  if (error) {
    throw new Error(`Failed to ensure profile row for auth user: ${error.message}`);
  }
}

export async function syncGooglePrimaryCalendar(userId: string): Promise<CalendarSyncResult> {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for secure Google sync.");
  }

  const admin = createSupabaseAdminClient();
  const token = await getValidGoogleAccessToken(userId, GOOGLE_CALENDAR_SCOPE);

  if (!token) {
    throw new Error("No Google provider token stored for this user.");
  }

  const familyGroupId = await getPrimaryFamilyGroupId(userId);
  const windowStart = subDays(new Date(), 1);
  const windowEnd = addDays(new Date(), 30);
  const availableCalendars = await fetchGoogleCalendarList(token);
  const selectedCalendars = await resolveSelectedGoogleCalendars(userId, availableCalendars);

  if (selectedCalendars.length === 0) {
    throw new Error("Select at least one Google calendar before syncing.");
  }

  const eventsPerCalendar = await Promise.all(
    selectedCalendars.map(async (calendar) => ({
      calendar,
      events: await fetchGoogleCalendarEvents(token, calendar.id, windowStart, windowEnd),
    })),
  );

  const mappedEvents = eventsPerCalendar
    .flatMap(({ calendar, events }) =>
      events
        .map((event) =>
          mapGoogleEventToCacheRow(
            event,
            userId,
            familyGroupId,
            calendar.id,
            calendar.summary ?? "Untitled calendar",
          ),
        )
        .filter((row): row is NonNullable<typeof row> => Boolean(row)),
    );

  const { data: existingRows, error: existingRowsError } = await admin
    .from("calendar_events_cache")
    .select("id")
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_CALENDAR_PROVIDER);

  if (existingRowsError) {
    throw new Error(`Failed to inspect existing calendar cache: ${existingRowsError.message}`);
  }

  const typedExistingRows = (existingRows ?? []) as Array<{ id: string }>;
  const deletedCount = typedExistingRows.length;

  if (typedExistingRows.length > 0) {
    const { error: deleteError } = await admin
      .from("calendar_events_cache")
      .delete()
      .in(
        "id",
        typedExistingRows.map((row) => row.id),
      );

    if (deleteError) {
      throw new Error(`Failed to clear previous calendar cache: ${deleteError.message}`);
    }
  }

  if (mappedEvents.length > 0) {
    const { error } = await admin.from("calendar_events_cache").upsert(mappedEvents as never, {
      onConflict: "profile_id,provider,external_id",
    });

    if (error) {
      throw new Error(`Failed to cache Google Calendar events: ${error.message}`);
    }
  }

  const now = new Date().toISOString();
  const selectedCalendarIds = selectedCalendars.map((calendar) => calendar.id);
  const selectedCalendarNames = selectedCalendars.map(
    (calendar) => calendar.summary ?? "Untitled calendar",
  );
  await admin
    .from("integration_accounts")
    .update({
      status: "connected",
      last_synced_at: now,
      updated_at: now,
      metadata: {
        syncedWindowStart: windowStart.toISOString(),
        syncedWindowEnd: windowEnd.toISOString(),
        selectedCalendarIds,
        selectedCalendarNames,
      },
    } as never)
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER);

  return {
    calendarNames: selectedCalendarNames,
    syncedCount: mappedEvents.length,
    deletedCount,
  };
}

export async function createGoogleCalendarEvent(
  input: GoogleCalendarCreateEventInput,
): Promise<GoogleCalendarCreatedEvent> {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for secure Google Calendar writes.");
  }

  const token = await getValidGoogleAccessToken(input.userId, GOOGLE_CALENDAR_SCOPE);

  if (!token) {
    throw new Error("No Google provider token stored for this user.");
  }

  const availableCalendars = await fetchGoogleCalendarList(token);
  const selectedCalendars = await resolveSelectedGoogleCalendars(input.userId, availableCalendars);
  const targetCalendar =
    availableCalendars.find((calendar) => calendar.id === input.calendarId) ??
    selectedCalendars[0] ??
    pickDefaultCalendars(availableCalendars)[0];

  if (!targetCalendar) {
    throw new Error("No writable Google calendar is available for this user.");
  }

  const payload = buildGoogleEventCreatePayload(input);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendar.id)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Google Calendar write access is missing. Sign in with Google again to grant calendar editing.");
    }

    throw new Error(`Google Calendar create event API returned ${response.status}.`);
  }

  const createdEvent = (await response.json()) as GoogleCalendarApiEvent;
  await syncGooglePrimaryCalendar(input.userId);

  return {
    calendarId: targetCalendar.id,
    calendarName: targetCalendar.summary ?? "Untitled calendar",
    eventId: createdEvent.id ?? "unknown",
    title: createdEvent.summary ?? input.title,
    startsAt: createdEvent.start?.dateTime ?? createdEvent.start?.date ?? input.startsAt,
    endsAt: createdEvent.end?.dateTime ?? createdEvent.end?.date ?? input.endsAt,
  };
}

export async function getGoogleCalendarChoices(userId: string): Promise<GoogleCalendarChoice[]> {
  if (!hasSupabaseAdminEnv()) {
    return [];
  }

  const token = await getValidGoogleAccessToken(userId, GOOGLE_CALENDAR_SCOPE);

  if (!token) {
    return [];
  }

  const availableCalendars = await fetchGoogleCalendarList(token);
  const savedCalendarIds = await getSavedSelectedGoogleCalendarIds(userId);
  const defaultCalendars = pickDefaultCalendars(availableCalendars);
  const selectedIds = new Set(
    savedCalendarIds.length > 0 ? savedCalendarIds : defaultCalendars.map((calendar) => calendar.id),
  );

  return availableCalendars.map((calendar) => ({
    id: calendar.id,
    summary: calendar.summary ?? "Untitled calendar",
    isPrimary: Boolean(calendar.primary),
    isSelected: selectedIds.has(calendar.id),
  }));
}

export async function saveSelectedGoogleCalendars(userId: string, calendarIds: string[]) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for secure calendar settings.");
  }

  const token = await getValidGoogleAccessToken(userId, GOOGLE_CALENDAR_SCOPE);

  if (!token) {
    throw new Error("No Google provider token stored for this user.");
  }

  const availableCalendars = await fetchGoogleCalendarList(token);
  const selectedCalendars = availableCalendars.filter((calendar) => calendarIds.includes(calendar.id));

  if (selectedCalendars.length === 0) {
    throw new Error("Choose at least one Google calendar.");
  }

  const admin = createSupabaseAdminClient();
  const { data: integrationAccount, error: integrationError } = await admin
    .from("integration_accounts")
    .select("metadata")
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER)
    .maybeSingle();

  if (integrationError) {
    throw new Error(`Failed to load Google integration settings: ${integrationError.message}`);
  }

  const typedIntegrationAccount = integrationAccount as IntegrationAccountMetadataRow | null;
  const metadata =
    typedIntegrationAccount &&
    typedIntegrationAccount.metadata &&
    typeof typedIntegrationAccount.metadata === "object"
      ? typedIntegrationAccount.metadata
      : {};

  const { error: updateError } = await admin
    .from("integration_accounts")
    .update({
      metadata: {
        ...metadata,
        selectedCalendarIds: selectedCalendars.map((calendar) => calendar.id),
        selectedCalendarNames: selectedCalendars.map(
          (calendar) => calendar.summary ?? "Untitled calendar",
        ),
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER);

  if (updateError) {
    throw new Error(`Failed to save calendar selection: ${updateError.message}`);
  }

  return selectedCalendars.map((calendar) => calendar.summary ?? "Untitled calendar");
}

async function getPrimaryFamilyGroupId(userId: string) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("family_group_members")
    .select("family_group_id")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  return data?.family_group_id ?? null;
}

async function fetchGoogleCalendarList(token: string) {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      maxResults: "250",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/users/me/calendarList?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Google Calendar list API returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      items?: GoogleCalendarListEntry[];
      nextPageToken?: string;
    };

    calendars.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken ?? null;
  } while (pageToken);

  return calendars;
}

async function fetchGoogleCalendarEvents(
  token: string,
  calendarId: string,
  windowStart: Date,
  windowEnd: Date,
) {
  const events: GoogleCalendarApiEvent[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      maxResults: "250",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Google Calendar API returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      items?: GoogleCalendarApiEvent[];
      nextPageToken?: string;
    };

    events.push(...(payload.items ?? []).filter((event) => event.status !== "cancelled"));
    pageToken = payload.nextPageToken ?? null;
  } while (pageToken);

  return events;
}

function mapGoogleEventToCacheRow(
  event: GoogleCalendarApiEvent,
  userId: string,
  familyGroupId: string | null,
  calendarId: string,
  calendarName: string,
): CachedCalendarEventRow | null {
  const startsAt = event.start?.dateTime ?? event.start?.date;
  const endsAt = event.end?.dateTime ?? event.end?.date;

  if (!event.id || !startsAt || !endsAt) {
    return null;
  }

  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);

  return {
    profile_id: userId,
    family_group_id: familyGroupId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    external_id: `${calendarId}:${event.id}`,
    calendar_id: calendarId,
    title: event.summary ?? "Untitled event",
    description: event.description ?? null,
    starts_at: normalizeGoogleDate(startsAt, false),
    ends_at: normalizeGoogleDate(endsAt, isAllDay),
    location: event.location ?? null,
    status: event.status ?? null,
    is_all_day: isAllDay,
    payload: {
      ...event,
      calendarName,
    } as GoogleCalendarApiEvent,
    synced_at: new Date().toISOString(),
  };
}

async function getSavedSelectedGoogleCalendarIds(userId: string) {
  if (!hasSupabaseAdminEnv()) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("integration_accounts")
    .select("metadata")
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER)
    .maybeSingle();

  const typedRow = data as IntegrationAccountMetadataRow | null;
  const selectedCalendarIds = typedRow?.metadata?.selectedCalendarIds;

  if (!Array.isArray(selectedCalendarIds)) {
    return [];
  }

  return selectedCalendarIds.filter((item): item is string => typeof item === "string");
}

async function resolveSelectedGoogleCalendars(
  userId: string,
  availableCalendars: GoogleCalendarListEntry[],
) {
  const savedIds = await getSavedSelectedGoogleCalendarIds(userId);
  const selectedFromSaved = availableCalendars.filter((calendar) => savedIds.includes(calendar.id));

  if (selectedFromSaved.length > 0) {
    return selectedFromSaved;
  }

  return pickDefaultCalendars(availableCalendars);
}

function pickDefaultCalendars(availableCalendars: GoogleCalendarListEntry[]) {
  const preferredCalendar = availableCalendars.find(
    (calendar) =>
      calendar.summary?.trim().toLowerCase() === PREFERRED_GOOGLE_CALENDAR_NAME.toLowerCase(),
  );

  if (preferredCalendar) {
    return [preferredCalendar];
  }

  const primaryCalendar = availableCalendars.find((calendar) => calendar.primary);

  if (primaryCalendar) {
    return [primaryCalendar];
  }

  return availableCalendars.length > 0 ? [availableCalendars[0]] : [];
}

function normalizeGoogleDate(input: string, shiftAllDayEnd: boolean) {
  if (input.includes("T")) {
    return input;
  }

  const date = new Date(`${input}T00:00:00.000Z`);

  if (shiftAllDayEnd) {
    return formatISO(date);
  }

  return formatISO(date);
}

function buildGoogleEventCreatePayload(input: GoogleCalendarCreateEventInput) {
  const isAllDay = Boolean(input.isAllDay);

  if (isAllDay) {
    const startDate = input.startsAt.slice(0, 10);
    const endDate = input.endsAt.slice(0, 10);

    return {
      summary: input.title,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      start: {
        date: startDate,
      },
      end: {
        date:
          endDate === startDate
            ? addDays(new Date(`${startDate}T00:00:00.000Z`), 1).toISOString().slice(0, 10)
            : endDate,
      },
    };
  }

  return {
    summary: input.title,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    start: {
      dateTime: input.startsAt,
      timeZone: "Europe/Copenhagen",
    },
    end: {
      dateTime: input.endsAt,
      timeZone: "Europe/Copenhagen",
    },
  };
}

export function addDefaultEventDuration(startsAtIso: string, durationMinutes = DEFAULT_EVENT_DURATION_MINUTES) {
  return new Date(new Date(startsAtIso).getTime() + durationMinutes * 60_000).toISOString();
}
