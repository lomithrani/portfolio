import { t } from 'elysia'

const availabilityWindow = t.Object({
  dayOfWeek: t.Number({ minimum: 0, maximum: 6 }),
  startTime: t.String(),
  endTime: t.String()
})

const dateOverrideWindow = t.Object({
  startTime: t.String(),
  endTime: t.String()
})

const dateOverride = t.Object({
  date: t.String(),
  available: t.Boolean(),
  windows: t.Optional(t.Array(dateOverrideWindow))
})

export const appointmentScheduleRequest = t.Object({
  title: t.String(),
  description: t.Optional(t.String()),
  durationMinutes: t.Optional(t.Number({ minimum: 5 })),
  bufferMinutes: t.Optional(t.Number({ minimum: 0 })),
  minNoticeHours: t.Optional(t.Number({ minimum: 0 })),
  maxAdvanceDays: t.Optional(t.Number({ minimum: 1 })),
  timezone: t.String(),
  calendarId: t.Optional(t.String()),
  locationType: t.Optional(t.Union([
    t.Literal('google_meet'),
    t.Literal('phone'),
    t.Literal('in_person'),
    t.Literal('custom')
  ])),
  locationDetails: t.Optional(t.String()),
  availability: t.Array(availabilityWindow),
  dateOverrides: t.Optional(t.Array(dateOverride)),
  enabled: t.Optional(t.Boolean())
})

export const bookAppointmentRequest = t.Object({
  scheduleId: t.String(),
  startTime: t.String(),
  name: t.String(),
  email: t.String({ format: 'email' }),
  notes: t.Optional(t.String())
})
