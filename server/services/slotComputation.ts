import type { AppointmentSchedule } from '../models/database/appointmentSchedule'

interface BusyBlock {
  start: string
  end: string
}

interface Slot {
  start: string
  end: string
}

interface TimeWindow {
  startTime: string
  endTime: string
}

export function computeAvailableSlots(
  schedule: AppointmentSchedule,
  date: string,
  busyBlocks: BusyBlock[]
): Slot[] {
  const dayOfWeek = getDayOfWeek(date, schedule.timezone)
  const windows = getWindowsForDate(schedule, date, dayOfWeek)

  if (windows.length === 0) return []

  const slotDuration = (schedule.durationMinutes ?? 30) + (schedule.bufferMinutes ?? 0)
  const minNoticeMs = (schedule.minNoticeHours ?? 24) * 60 * 60 * 1000
  const now = Date.now()
  const slots: Slot[] = []

  for (const window of windows) {
    const windowStart = parseTimeToDate(date, window.startTime, schedule.timezone)
    const windowEnd = parseTimeToDate(date, window.endTime, schedule.timezone)

    let cursor = windowStart.getTime()

    while (cursor + (schedule.durationMinutes ?? 30) * 60_000 <= windowEnd.getTime()) {
      const slotStart = new Date(cursor)
      const slotEnd = new Date(cursor + (schedule.durationMinutes ?? 30) * 60_000)

      if (slotStart.getTime() - now < minNoticeMs) {
        cursor += slotDuration * 60_000
        continue
      }

      const startIso = slotStart.toISOString()
      const endIso = slotEnd.toISOString()

      if (!overlapsWithBusy(startIso, endIso, busyBlocks)) {
        slots.push({ start: startIso, end: endIso })
      }

      cursor += slotDuration * 60_000
    }
  }

  return slots
}

function getDayOfWeek(dateStr: string, timezone: string): number {
  const date = new Date(dateStr + 'T12:00:00')
  const formatted = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone })
  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6
  }
  return dayMap[formatted] ?? 0
}

function getWindowsForDate(
  schedule: AppointmentSchedule,
  date: string,
  dayOfWeek: number
): TimeWindow[] {
  const override = schedule.dateOverrides?.find((o) => o.date === date)
  if (override) {
    if (!override.available) return []
    if (override.windows && override.windows.length > 0) {
      return override.windows
    }
  }

  return (schedule.availability ?? [])
    .filter((a) => a.dayOfWeek === dayOfWeek)
    .map((a) => ({ startTime: a.startTime, endTime: a.endTime }))
}

function parseTimeToDate(dateStr: string, time: string, timezone: string): Date {
  const dtString = `${dateStr}T${time}:00`
  const localDate = new Date(dtString)

  const utcFormatted = localDate.toLocaleString('en-US', { timeZone: timezone })
  const utcDate = new Date(utcFormatted)
  const offset = utcDate.getTime() - localDate.getTime()

  return new Date(localDate.getTime() - offset)
}

function overlapsWithBusy(start: string, end: string, busyBlocks: BusyBlock[]): boolean {
  const slotStart = new Date(start).getTime()
  const slotEnd = new Date(end).getTime()

  return busyBlocks.some((block) => {
    const busyStart = new Date(block.start).getTime()
    const busyEnd = new Date(block.end).getTime()
    return slotStart < busyEnd && slotEnd > busyStart
  })
}
