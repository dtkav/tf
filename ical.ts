import ical, { CalendarComponent, VEvent } from "node-ical";
import moment from "moment-timezone";
import { Editor, requestUrl } from "obsidian";
import { fetchData, Callback } from "./fetch";

/**
 * Fetches data from a URL and parses it using `ical.parseICS`.
 * @param url - The URL to fetch from.
 * @param cb - Optional callback to handle results.
 * @returns - A Promise with parsed data or void if callback is provided.
 */
function fetchICS(url: string, cb?: Callback): Promise<any> | void {
  return fetchData(
    url,
    (response) => response.text,
    (error, data) => {
      if (error) {
        if (cb) cb(error, null);
        return;
      }
      ical.parseICS(data, (err, ics) => {
        if (err) {
          if (cb) cb(err, null);
          return;
        }
        if (cb) cb(null, ics);
      });
    }
  );
}

function isAllDayEvent(start: moment.Moment, end: moment.Moment): boolean {
  // Check if hours, minutes, and seconds are zero for both dates
  const isStartTimeZero =
    start.hour() === 0 && start.minute() === 0 && start.second() === 0;
  const isEndTimeZero =
    end.hour() === 0 && end.minute() === 0 && end.second() === 0;

  // Check if the duration is exactly 1 day
  const duration = moment.duration(end.diff(start));
  const isOneDayDuration = duration.asDays() === 1;

  return isStartTimeZero && isEndTimeZero && isOneDayDuration;
}

function formatMarkwhen(start: moment.Moment, end: moment.Moment): string {
  if (isAllDayEvent(start, end)) {
    return moment(start).format("YYYY-MM-DD");
  }
  return moment(start).format("hh:mma") + " - " + moment(end).format("hh:mma");
}

function formatVEvent(event: VEvent): string {
  return (
    formatMarkwhen(moment(event.start), moment(event.end)) +
    ": " +
    event.summary
  );
}

function eventBetween(
  event: ical.VEvent,
  start: moment.Moment,
  end: moment.Moment
) {
  let tzStart = start.toDate();
  let tzEnd = end.toDate();
  return event.start >= tzStart && event.end <= tzEnd;
}

/*
 * Only works on full days
 */
function rruleBetween(
  event: ical.VEvent,
  start: moment.Moment,
  end: moment.Moment
) {
  /*
   * returns a naive native date
   */
  function toDate(m: moment.Moment) {
    const d = new Date(m.year(), m.month(), m.date(), 0, 0, 0, 0);
    return d;
  }

  if (event.type !== "VEVENT" || !event.rrule) {
    return [];
  }

  return event.rrule.between(toDate(start), toDate(end));
}

function isVEvent(value: CalendarComponent): value is VEvent {
  return (value as VEvent).type === "VEVENT";
}

type EventMap = Record<string, VEvent>;

function getEvents(
  calendar: ical.CalendarResponse,
  start: moment.Moment,
  end: moment.Moment
): string[] {
  let events = [];
  let eventMap: EventMap = {};
  for (let k in calendar) {
    if (!Object.prototype.hasOwnProperty.call(calendar, k)) continue;

    const event: ical.CalendarComponent = calendar[k];
    if (isVEvent(event)) {
      if (eventBetween(event, start, end)) {
        eventMap[event.uid] = event;
        events.push([event.start, formatVEvent(event)]);
      }

      const dates = rruleBetween(event, start, end);
      if (dates.length === 0) continue;

      Object.values(event.recurrences).forEach((recurrence) => {
        if (!eventBetween(recurrence, start, end)) return;
        eventMap[recurrence.uid] = recurrence;
        events.push([recurrence.start, formatVEvent(recurrence)]);
      });
    }
  }
  return Object.values(eventMap)
    .sort((a: VEvent, b: VEvent): number => {
      return a.start.getTime() - b.start.getTime();
    })
    .map((vevent: VEvent) => formatVEvent(vevent));
}

export function paintCalendar(
  url: string,
  start: moment.Moment,
  end: moment.Moment,
  canvas: HTMLElement
): void {
  fetchICS(url, (err: any, data: any) => {
    let events = getEvents(data, start, end);
    canvas.innerHTML = "";
    function appendEventSummariesToElement(
      element: HTMLElement,
      summaries: string[]
    ): void {
      for (const summary of summaries) {
        const p = document.createElement("p");
        p.textContent = summary;
        element.appendChild(p);
      }
    }
    appendEventSummariesToElement(canvas, events);
    console.log(canvas);
  });
}

export function cachedFetchCalendar(url: string, timeout: number = 60000) {
  // Cache object to store results and last call time
  const cache = {
    lastCall: null,
    result: null,
  };

  return async function () {
    const currentTime = Date.now();

    // If never called or timeout has passed since last call
    if (!cache.lastCall || currentTime - cache.lastCall > timeout) {
      try {
        await fetchICS(url, (err: any, data: any) => {
          cache.result = data;
        });
        cache.lastCall = currentTime;
      } catch (error) {
        console.error("Failed to fetch from the URL:", error);
        throw error;
      }
    }

    return cache.result;
  };
}

export function insertCalendarDay(
  calendar: ical.CalendarResponse,
  date: moment.Moment,
  editor: Editor
): void {
  const start = moment(date).startOf("day");
  const end = moment(date).add(1, "days");
  let events = getEvents(calendar, start, end);
  let cursor = editor.getCursor();
  editor.replaceRange(
    "\n``` markwhen\n" + events.join("\n") + "\n```",
    cursor
  );
}
