import { requestUrl } from "obsidian";
import {
  convertIcsCalendar,
  extendByRecurrenceRule,
  getEventEnd,
  type IcsEvent,
  type IcsAttendee,
  type IcsDateObject,
} from "ts-ics";
import type { CalendarSource } from "./settings";
import { isSameDay } from "./helpers";

export interface ScheduleEvent {
  readonly uid: string;
  readonly title: string;
  readonly start: Date;
  readonly end: Date | null;
  readonly allDay: boolean;
  readonly attendees: readonly IcsAttendee[];
  readonly location: string | null;
  readonly description: string | null;
  readonly calendarName: string;
  readonly calendarColor: string;
}

function icsDateToDate(d: IcsDateObject): Date {
  return d.date;
}

function isAllDay(d: IcsDateObject): boolean {
  return d.type === "DATE";
}

function computeEndDate(event: IcsEvent): Date | null {
  if (event.end) return icsDateToDate(event.end);
  if (!event.duration) return null;

  try {
    return getEventEnd(event as Parameters<typeof getEventEnd>[0]);
  } catch {
    return null;
  }
}

function eventToScheduleEvent(
  event: IcsEvent,
  startDate: Date,
  calendarName: string,
  calendarColor: string,
): ScheduleEvent {
  const allDay = isAllDay(event.start);

  // For recurring events, `startDate` is a new occurrence (e.g. today), but
  // `event.end` still points at the ORIGINAL event's end. Shift the end by
  // the delta between the original start and this occurrence so that e.g. a
  // daily 9:00-9:30 standup has end = today 9:30, not Jan 1 9:30.
  const originalStart = icsDateToDate(event.start);
  const originalEnd = computeEndDate(event);
  const durationMs =
    originalEnd && originalEnd.getTime() >= originalStart.getTime()
      ? originalEnd.getTime() - originalStart.getTime()
      : null;
  const end: Date | null = durationMs !== null ? new Date(startDate.getTime() + durationMs) : null;

  return {
    uid: event.uid,
    title: event.summary || "Untitled",
    start: startDate,
    end,
    allDay,
    attendees: event.attendees ?? [],
    location: event.location ?? null,
    description: event.description ?? null,
    calendarName,
    calendarColor,
  };
}

function expandEventsForToday(
  events: readonly IcsEvent[],
  today: Date,
  calendarName: string,
  calendarColor: string,
): readonly ScheduleEvent[] {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const results: ScheduleEvent[] = [];

  for (const event of events) {
    const eventStart = icsDateToDate(event.start);

    if (event.recurrenceRule) {
      const exceptionDates = (event.exceptionDates ?? []).map((ex) => ex.date);
      try {
        const occurrences = extendByRecurrenceRule(event.recurrenceRule, {
          start: eventStart,
          end: todayEnd,
          exceptions: exceptionDates,
        });
        for (const occ of occurrences) {
          if (isSameDay(occ, today)) {
            results.push(eventToScheduleEvent(event, occ, calendarName, calendarColor));
          }
        }
      } catch (err) {
        console.warn(`[daily-schedule] Failed to expand RRULE for "${event.summary}":`, err);
        if (isSameDay(eventStart, today)) {
          results.push(eventToScheduleEvent(event, eventStart, calendarName, calendarColor));
        }
      }
    } else {
      if (isSameDay(eventStart, today)) {
        results.push(eventToScheduleEvent(event, eventStart, calendarName, calendarColor));
      }
    }
  }

  return results;
}

export async function fetchCalendarEvents(
  sources: readonly CalendarSource[],
  ignorePatterns: readonly string[],
): Promise<readonly ScheduleEvent[]> {
  const allEvents: ScheduleEvent[] = [];
  const today = new Date();

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await requestUrl({ url: source.url });
      const calendar = convertIcsCalendar(undefined, response.text);
      const events = calendar.events ?? [];
      return expandEventsForToday(events, today, source.name, source.color);
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allEvents.push(...result.value);
    } else {
      console.error("[daily-schedule] Failed to fetch calendar:", result.reason);
    }
  }

  const lowerPatterns = ignorePatterns.map((p) => p.toLowerCase());
  const filtered = allEvents.filter((e) => {
    const title = e.title.toLowerCase();
    return !lowerPatterns.some((pattern) => title.includes(pattern));
  });

  const deduped = [...deduplicateByUid(filtered)];
  return deduped.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return a.start.getTime() - b.start.getTime();
  });
}

function deduplicateByUid(events: readonly ScheduleEvent[]): readonly ScheduleEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.uid}-${e.start.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
