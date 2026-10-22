/**
 * What a therapist may save as their calendar.
 *
 * saveAvailability wrote the request body straight onto the document: any
 * slot string, any number of dates, dates years ahead or long past, booked
 * flags chosen by the client. The booking grid is hourly from 9 AM to 8 PM
 * (IST), so that is what is accepted; past dates are dropped rather than
 * refused (a calendar saved last month still carries them).
 */

const { normalizeTimeTo24h, to12hSlot, utcToZoned } = require('./zonedTime');
const { PLATFORM_TIMEZONE } = require('../config/time');

const TYPES = ['weekly', 'same_slots', 'different_slots'];
const FIRST_HOUR = 9;
const LAST_HOUR = 20;
const MAX_DAYS_AHEAD = 60;
const MAX_DATES = 120;

/** '09:00 AM'-style slot, or null when it is not on the grid. */
function gridSlot(value) {
  try {
    const [h, m] = normalizeTimeTo24h(value).split(':').map(Number);
    if (m !== 0 || h < FIRST_HOUR || h > LAST_HOUR) return null;
    return to12hSlot(`${h}:00`);
  } catch {
    return null;
  }
}

function slotList(list) {
  if (!Array.isArray(list)) return { error: 'Times must be a list.' };
  const out = [];
  for (const t of list) {
    const slot = gridSlot(typeof t === 'object' && t ? t.time : t);
    if (!slot) return { error: 'Times must be on the hour, from 9 AM to 8 PM.' };
    if (!out.includes(slot)) out.push(slot);
  }
  return { value: out };
}

/** Real calendar dates from today (IST) to MAX_DAYS_AHEAD; earlier ones dropped. */
function dateList(list, today, lastDay) {
  if (list === undefined || list === null) return { value: [] };
  if (!Array.isArray(list) || list.length > MAX_DATES) return { error: 'Too many dates.' };
  const out = [];
  for (const d of list) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))
      || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) return { error: `"${d}" is not a date.` };
    if (d < today) continue;
    if (d > lastDay) return { error: `Dates can be set up to ${MAX_DAYS_AHEAD} days ahead.` };
    if (!out.includes(d)) out.push(d);
  }
  return { value: out };
}

/** @returns {{ error?: string, value?: object }} */
function checkAvailability(body, { now = new Date() } = {}) {
  const type = body.availabilityType;
  if (!TYPES.includes(type)) return { error: 'Choose how your calendar repeats.' };
  const today = utcToZoned(now, PLATFORM_TIMEZONE).localDate;
  const lastDay = utcToZoned(new Date(now.getTime() + MAX_DAYS_AHEAD * 864e5), PLATFORM_TIMEZONE).localDate;

  const defaults = slotList(body.defaultSlots || []);
  if (defaults.error) return defaults;
  const active = dateList(body.activeDates, today, lastDay);
  if (active.error) return active;
  const off = dateList(body.offDates, today, lastDay);
  if (off.error) return off;

  const weekly = [];
  if (body.weeklySlots !== undefined) {
    if (!Array.isArray(body.weeklySlots)) return { error: 'Weekly times must be a list.' };
    for (const day of body.weeklySlots) {
      const weekday = day && day.weekday;
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'Each weekly entry needs a weekday.' };
      if (weekly.some((w) => w.weekday === weekday)) return { error: 'A weekday is listed twice.' };
      const slots = slotList(day.slots || []);
      if (slots.error) return slots;
      if (slots.value.length) weekly.push({ weekday, slots: slots.value });
    }
  }

  const custom = [];
  if (body.customAvailability !== undefined) {
    if (!Array.isArray(body.customAvailability) || body.customAvailability.length > MAX_DATES) return { error: 'Too many days.' };
    for (const day of body.customAvailability) {
      const date = dateList([day && day.date], today, lastDay);
      if (date.error) return date;
      if (!date.value.length) continue; // a past day
      const slots = slotList((day && day.slots) || []);
      if (slots.error) return slots;
      // Booked flags are the server's (bookedSlots), never the client's.
      custom.push({ date: date.value[0], slots: slots.value.map((time) => ({ time, isBooked: false })) });
    }
  }

  return {
    value: {
      availabilityType: type,
      defaultSlots: defaults.value,
      activeDates: active.value,
      offDates: off.value,
      weeklySlots: weekly,
      customAvailability: custom,
    }
  };
}

module.exports = { checkAvailability, gridSlot, MAX_DAYS_AHEAD };
