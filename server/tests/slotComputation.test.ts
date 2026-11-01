import { describe, expect, it } from 'bun:test'
import { computeAvailableSlots, wallClockToUTC } from '../services/slotComputation'
import type { AppointmentSchedule } from '../models/database/appointmentSchedule'

describe('wallClockToUTC', () => {
  it('converts a morning time in a positive-offset timezone', () => {
    expect(wallClockToUTC('2026-07-29', '09:00', 'Europe/Paris').toISOString()).toBe(
      '2026-07-29T07:00:00.000Z'
    )
  })

  it('handles times whose UTC approximation crosses midnight forward (regression)', () => {
    // 23:59 Paris (UTC+2): the approximate UTC date shown in Paris is 01:59 the NEXT day
    expect(wallClockToUTC('2026-07-29', '23:59', 'Europe/Paris').toISOString()).toBe(
      '2026-07-29T21:59:00.000Z'
    )
  })

  it('handles times whose UTC approximation crosses midnight backward', () => {
    // 01:00 New York (UTC-5 in winter): the approximate UTC date shown in NY is 21:00 the PREVIOUS day
    expect(wallClockToUTC('2026-01-15', '01:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T06:00:00.000Z'
    )
  })

  it('handles midnight itself', () => {
    expect(wallClockToUTC('2026-07-29', '00:00', 'Europe/Paris').toISOString()).toBe(
      '2026-07-28T22:00:00.000Z'
    )
  })

  it('is exact across a DST transition day', () => {
    // Paris switches to summer time on 2026-03-29 at 02:00 -> 03:00
    expect(wallClockToUTC('2026-03-29', '10:00', 'Europe/Paris').toISOString()).toBe(
      '2026-03-29T08:00:00.000Z'
    )
    expect(wallClockToUTC('2026-03-28', '10:00', 'Europe/Paris').toISOString()).toBe(
      '2026-03-28T09:00:00.000Z'
    )
  })
})

const makeSchedule = (overrides: Record<string, unknown> = {}) =>
  ({
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeHours: 24,
    maxAdvanceDays: 365 * 10,
    timezone: 'Europe/Paris',
    availability: [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '09:00',
      endTime: '11:00'
    })),
    dateOverrides: [],
    ...overrides
  }) as unknown as AppointmentSchedule

describe('computeAvailableSlots', () => {
  const date = '2027-06-09' // far future, well past min notice

  it('produces contiguous slots within the availability window', () => {
    const slots = computeAvailableSlots(makeSchedule(), date, [])
    expect(slots).toHaveLength(4)
    expect(slots[0].start).toBe('2027-06-09T07:00:00.000Z') // 09:00 Paris (UTC+2)
    expect(slots[3].end).toBe('2027-06-09T09:00:00.000Z') // 11:00 Paris
  })

  it('keeps every slot on the requested day even for late windows (regression)', () => {
    const schedule = makeSchedule({
      availability: [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: '22:00',
        endTime: '23:30'
      }))
    })
    const slots = computeAvailableSlots(schedule, date, [])
    expect(slots).toHaveLength(3)
    expect(slots[0].start).toBe('2027-06-09T20:00:00.000Z') // 22:00 Paris
    expect(slots[2].end).toBe('2027-06-09T21:30:00.000Z') // 23:30 Paris
  })

  it('removes slots overlapping busy blocks', () => {
    const busy = [{ start: '2027-06-09T07:15:00.000Z', end: '2027-06-09T07:45:00.000Z' }]
    const slots = computeAvailableSlots(makeSchedule(), date, busy)
    expect(slots).toHaveLength(2)
    expect(slots.map((s) => s.start)).toEqual([
      '2027-06-09T08:00:00.000Z',
      '2027-06-09T08:30:00.000Z'
    ])
  })

  it('respects full-day unavailable overrides', () => {
    const schedule = makeSchedule({
      dateOverrides: [{ date, available: false }]
    })
    expect(computeAvailableSlots(schedule, date, [])).toHaveLength(0)
  })

  it('enforces minimum notice', () => {
    const today = new Date().toISOString().slice(0, 10)
    const schedule = makeSchedule({
      minNoticeHours: 24 * 400,
      availability: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: '00:00',
        endTime: '23:59'
      }))
    })
    expect(computeAvailableSlots(schedule, today, [])).toHaveLength(0)
  })
})
