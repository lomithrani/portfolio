import { t } from 'elysia'

// HH:mm, 00:00 to 23:59 (availability is set per day)
const wallTime = t.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' })
const isoDate = t.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' })
const objectId = t.String({ pattern: '^[0-9a-fA-F]{24}$' })

const availabilityWindow = t.Object({
  dayOfWeek: t.Integer({ minimum: 0, maximum: 6 }),
  startTime: wallTime,
  endTime: wallTime
})

const dateOverrideWindow = t.Object({
  startTime: wallTime,
  endTime: wallTime
})

const dateOverride = t.Object({
  date: isoDate,
  available: t.Boolean(),
  windows: t.Optional(t.Array(dateOverrideWindow, { maxItems: 24 }))
})

export const appointmentScheduleRequest = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  durationMinutes: t.Optional(t.Integer({ minimum: 5, maximum: 480 })),
  bufferMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 480 })),
  minNoticeHours: t.Optional(t.Integer({ minimum: 0, maximum: 24 * 365 })),
  maxAdvanceDays: t.Optional(t.Integer({ minimum: 1, maximum: 365 })),
  // IANA time zone, checked with Intl by the route
  timezone: t.String({ minLength: 1, maxLength: 64 }),
  calendarId: t.Optional(t.String({ minLength: 1, maxLength: 1024 })),
  locationType: t.Optional(t.Union([
    t.Literal('google_meet'),
    t.Literal('phone'),
    t.Literal('in_person'),
    t.Literal('custom')
  ])),
  locationDetails: t.Optional(t.String({ maxLength: 500 })),
  availability: t.Array(availabilityWindow, { maxItems: 7 * 24 }),
  dateOverrides: t.Optional(t.Array(dateOverride, { maxItems: 366 })),
  enabled: t.Optional(t.Boolean())
})

// Dates in the schedule's time zone; real calendar dates, checked by the route
export const availableSlotsQuery = t.Object({
  scheduleId: objectId,
  date: isoDate
})

// At most MAX_AVAILABLE_DATES_RANGE dates, from <= to: checked by the route
export const availableDatesQuery = t.Object({
  scheduleId: objectId,
  from: isoDate,
  to: isoDate
})

export const bookAppointmentRequest = t.Object({
  scheduleId: objectId,
  // ISO 8601 instant of one of the slots returned by /appointments/available-slots
  startTime: t.String({ minLength: 1, maxLength: 64 }),
  name: t.String({ minLength: 1, maxLength: 200 }),
  email: t.String({ format: 'email', maxLength: 254 }),
  notes: t.Optional(t.String({ maxLength: 2000 }))
})
