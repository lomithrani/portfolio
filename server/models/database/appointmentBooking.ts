import { Schema, model } from 'mongoose'
import type { InferSchemaType } from 'mongoose'

// One document per slot booked through POST /appointments/book, written before
// the Google event is created: the unique (schedule, start) index makes a
// second booking of the same slot fail, even while both requests saw the slot
// free in Google FreeBusy. Removed when the booking is cancelled from the admin
// panel, when the Google event creation fails, and by MongoDB once the slot is
// over (TTL index on `end`).
export const appointmentBookingSchema = new Schema({
  schedule: { type: Schema.Types.ObjectId, ref: 'AppointmentSchedule', required: true },
  /** The schedule's owner, whose calendar holds the event */
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  calendarId: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  /** SHA-256 of the visitor's normalized email (no address stored), for the per-email cap */
  emailHash: { type: String, required: true },
  /** Google event id; unset while the event is being created (pending) */
  eventId: { type: String },
  createdAt: { type: Date, required: true, default: Date.now }
}, { versionKey: false })

appointmentBookingSchema.index({ schedule: 1, start: 1 }, { unique: true })
// Overlapping bookings on the same calendar (another schedule, or a shifted slot grid)
appointmentBookingSchema.index({ user: 1, calendarId: 1, start: 1 })
appointmentBookingSchema.index({ schedule: 1, emailHash: 1 })
appointmentBookingSchema.index({ user: 1, eventId: 1 })
appointmentBookingSchema.index({ end: 1 }, { expireAfterSeconds: 0 })

export type AppointmentBooking = InferSchemaType<typeof appointmentBookingSchema>
export const AppointmentBooking = model('AppointmentBooking', appointmentBookingSchema)
