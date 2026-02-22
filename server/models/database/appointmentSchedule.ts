import { Schema, model } from 'mongoose'
import type { InferSchemaType } from 'mongoose'

const availabilityWindowSchema = new Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true }
}, { _id: false })

const dateOverrideWindowSchema = new Schema({
  startTime: { type: String, required: true },
  endTime: { type: String, required: true }
}, { _id: false })

const dateOverrideSchema = new Schema({
  date: { type: String, required: true },
  available: { type: Boolean, required: true },
  windows: { type: [dateOverrideWindowSchema], default: undefined }
}, { _id: false })

export const appointmentScheduleSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  durationMinutes: { type: Number, default: 30 },
  bufferMinutes: { type: Number, default: 0 },
  minNoticeHours: { type: Number, default: 24 },
  maxAdvanceDays: { type: Number, default: 30 },
  timezone: { type: String, required: true },
  calendarId: { type: String, default: 'primary' },
  locationType: {
    type: String,
    enum: ['google_meet', 'phone', 'in_person', 'custom'],
    default: 'google_meet'
  },
  locationDetails: { type: String },
  availability: { type: [availabilityWindowSchema], default: [] },
  dateOverrides: { type: [dateOverrideSchema], default: [] },
  enabled: { type: Boolean, default: true }
})

export type AppointmentSchedule = InferSchemaType<typeof appointmentScheduleSchema>
export const AppointmentSchedule = model('AppointmentSchedule', appointmentScheduleSchema)
