import { describe, expect, it } from 'bun:test'
import { addDays } from 'portfolio-common'
import {
  computeAvailableSlots,
  computeAvailableSlotsByDate,
  wallClockToUTC
} from '../services/slotComputation'
import type { BusyBlock } from '../services/slotComputation'
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

/** The dates of a computeAvailableSlotsByDate result that have a slot */
const bookable = (slotsByDate: Map<string, unknown[]>) =>
  [...slotsByDate].filter(([, slots]) => slots.length > 0).map(([date]) => date)

/** Day of the week of a YYYY-MM-DD date (0 = Sunday) */
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

const slot = (start: string, end: string) => ({ start, end })

// One-hour slots on Mondays and Sundays, 09:00-12:00 in Paris
const mondayAndSunday = (overrides: Record<string, unknown> = {}) =>
  makeSchedule({
    durationMinutes: 60,
    availability: [1, 0].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' })),
    ...overrides
  })

// June 2027 starts on a Tuesday: Sundays 6, 13, 20, 27 and Mondays 7, 14, 21, 28
const JUNE_1 = Date.parse('2027-06-01T00:00:00Z')
const JANUARY_1 = Date.parse('2027-01-01T00:00:00Z')

describe('computeAvailableSlotsByDate', () => {
  it('lists every date of the range, with slots on the weekdays of the weekly availability only', () => {
    const slotsByDate = computeAvailableSlotsByDate(mondayAndSunday(), '2027-06-03', '2027-06-30', [], JUNE_1)

    expect([...slotsByDate.keys()]).toHaveLength(28)
    expect([...slotsByDate.keys()].at(-1)).toBe('2027-06-30')
    expect(bookable(slotsByDate)).toEqual([
      '2027-06-06',
      '2027-06-07',
      '2027-06-13',
      '2027-06-14',
      '2027-06-20',
      '2027-06-21',
      '2027-06-27',
      '2027-06-28'
    ])
    expect(bookable(slotsByDate).map(weekday)).toEqual([0, 1, 0, 1, 0, 1, 0, 1])
    // 09:00-12:00 in Paris (UTC+2)
    expect(slotsByDate.get('2027-06-07')).toEqual([
      slot('2027-06-07T07:00:00.000Z', '2027-06-07T08:00:00.000Z'),
      slot('2027-06-07T08:00:00.000Z', '2027-06-07T09:00:00.000Z'),
      slot('2027-06-07T09:00:00.000Z', '2027-06-07T10:00:00.000Z')
    ])
  })

  it('applies date overrides both ways', () => {
    const schedule = mondayAndSunday({
      dateOverrides: [
        // A Monday off
        { date: '2027-06-14', available: false },
        // A Wednesday with its own hours, though Wednesdays have none
        { date: '2027-06-16', available: true, windows: [{ startTime: '14:00', endTime: '15:00' }] },
        // A Sunday with other hours
        { date: '2027-06-20', available: true, windows: [{ startTime: '18:00', endTime: '19:00' }] },
        // Available without hours of its own: the weekly ones of its day, none on a Thursday
        { date: '2027-06-17', available: true }
      ]
    })
    const slotsByDate = computeAvailableSlotsByDate(schedule, '2027-06-13', '2027-06-21', [], JUNE_1)

    expect(bookable(slotsByDate)).toEqual(['2027-06-13', '2027-06-16', '2027-06-20', '2027-06-21'])
    expect(slotsByDate.get('2027-06-16')).toEqual([slot('2027-06-16T12:00:00.000Z', '2027-06-16T13:00:00.000Z')])
    expect(slotsByDate.get('2027-06-20')).toEqual([slot('2027-06-20T16:00:00.000Z', '2027-06-20T17:00:00.000Z')])
  })

  it('leaves out the dates whose slots all start inside the minimum notice', () => {
    // Sunday 6 June, 08:00 in Paris
    const now = Date.parse('2027-06-06T06:00:00Z')
    const withNotice = (minNoticeHours: number) =>
      computeAvailableSlotsByDate(mondayAndSunday({ minNoticeHours }), '2027-06-06', '2027-06-14', [], now)

    expect(bookable(withNotice(0))).toEqual(['2027-06-06', '2027-06-07', '2027-06-13', '2027-06-14'])
    // Sunday 09:00 is an hour away; Monday 09:00 is 25 hours away
    expect(bookable(withNotice(24))).toEqual(['2027-06-07', '2027-06-13', '2027-06-14'])
    // Monday keeps the slots 26 hours away or more
    expect(withNotice(26).get('2027-06-07')?.map((s) => s.start)).toEqual([
      '2027-06-07T08:00:00.000Z',
      '2027-06-07T09:00:00.000Z'
    ])
    expect(bookable(withNotice(48))).toEqual(['2027-06-13', '2027-06-14'])
  })

  it('removes a date the calendar is busy all day, and keeps a partly busy one', () => {
    const busy = [
      // All of Sunday 13 June in Paris
      { start: '2027-06-12T22:00:00.000Z', end: '2027-06-13T22:00:00.000Z' },
      // Monday 14 June, 09:00-11:00 in Paris
      { start: '2027-06-14T07:00:00.000Z', end: '2027-06-14T09:00:00.000Z' }
    ]
    const slotsByDate = computeAvailableSlotsByDate(mondayAndSunday(), '2027-06-13', '2027-06-14', busy, JUNE_1)

    expect(bookable(slotsByDate)).toEqual(['2027-06-14'])
    expect(slotsByDate.get('2027-06-14')).toEqual([slot('2027-06-14T09:00:00.000Z', '2027-06-14T10:00:00.000Z')])
  })

  it('reads the dates in the schedule time zone, far from UTC', () => {
    // Auckland (UTC+12 in June): Monday 09:00 there is Sunday 21:00 UTC.
    // Regression: the weekday of a date was read at 12:00 UTC in the schedule's
    // zone, already the next day from UTC+12 on, so Sundays took Monday's hours
    const auckland = mondayAndSunday({
      timezone: 'Pacific/Auckland',
      availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }]
    })
    const aucklandSlots = computeAvailableSlotsByDate(auckland, '2027-06-05', '2027-06-08', [], JUNE_1)
    expect(bookable(aucklandSlots)).toEqual(['2027-06-07'])
    expect(aucklandSlots.get('2027-06-07')).toEqual([slot('2027-06-06T21:00:00.000Z', '2027-06-06T22:00:00.000Z')])

    // Los Angeles (UTC-7 in June): Sunday evening there is Monday in UTC, and
    // so is the busy block that takes its first slot
    const losAngeles = mondayAndSunday({
      timezone: 'America/Los_Angeles',
      availability: [{ dayOfWeek: 0, startTime: '20:00', endTime: '22:00' }]
    })
    const busy = [{ start: '2027-06-07T03:00:00.000Z', end: '2027-06-07T04:00:00.000Z' }]
    const losAngelesSlots = computeAvailableSlotsByDate(losAngeles, '2027-06-06', '2027-06-07', busy, JUNE_1)
    expect(bookable(losAngelesSlots)).toEqual(['2027-06-06'])
    expect(losAngelesSlots.get('2027-06-06')).toEqual([slot('2027-06-07T04:00:00.000Z', '2027-06-07T05:00:00.000Z')])
  })

  it('keeps every date and its hours across the DST changes of Europe/Paris', () => {
    // Sunday 28 March 2027: 02:00 -> 03:00 (UTC+1 -> UTC+2)
    const spring = computeAvailableSlotsByDate(mondayAndSunday(), '2027-03-21', '2027-03-29', [], JANUARY_1)
    expect([...spring.keys()]).toHaveLength(9)
    expect(bookable(spring)).toEqual(['2027-03-21', '2027-03-22', '2027-03-28', '2027-03-29'])
    expect(spring.get('2027-03-22')?.[0].start).toBe('2027-03-22T08:00:00.000Z')
    expect(spring.get('2027-03-28')?.[0].start).toBe('2027-03-28T07:00:00.000Z')

    // Sunday 31 October 2027: 03:00 -> 02:00 (UTC+2 -> UTC+1)
    const autumn = computeAvailableSlotsByDate(mondayAndSunday(), '2027-10-25', '2027-11-01', [], JANUARY_1)
    expect([...autumn.keys()]).toHaveLength(8)
    expect(bookable(autumn)).toEqual(['2027-10-25', '2027-10-31', '2027-11-01'])
    expect(autumn.get('2027-10-25')?.[0].start).toBe('2027-10-25T07:00:00.000Z')
    expect(autumn.get('2027-10-31')?.[0].start).toBe('2027-10-31T08:00:00.000Z')
  })

  it('removes a DST day busy from midnight to midnight, and only that day', () => {
    // 28 March 2027 lasts 23 hours in Paris, 31 October 2027 lasts 25
    const spring = computeAvailableSlotsByDate(
      mondayAndSunday(),
      '2027-03-28',
      '2027-03-29',
      [{ start: '2027-03-27T23:00:00.000Z', end: '2027-03-28T22:00:00.000Z' }],
      JANUARY_1
    )
    expect(bookable(spring)).toEqual(['2027-03-29'])

    const autumn = computeAvailableSlotsByDate(
      mondayAndSunday(),
      '2027-10-31',
      '2027-11-01',
      [{ start: '2027-10-30T22:00:00.000Z', end: '2027-10-31T23:00:00.000Z' }],
      JANUARY_1
    )
    expect(bookable(autumn)).toEqual(['2027-11-01'])
  })

  it('gives each date the slots computeAvailableSlots gives it against every busy block (property)', () => {
    // Deterministic pseudo-random numbers (mulberry32)
    let state = 20270328
    const random = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
    const wallTime = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

    const ranges: [string, string, string][] = [
      ['Europe/Paris', '2027-03-20', '2027-04-04'],
      ['Europe/Paris', '2027-10-24', '2027-11-07'],
      ['America/Los_Angeles', '2027-03-07', '2027-03-21'],
      ['Pacific/Auckland', '2027-03-28', '2027-04-11'],
      // Changes at midnight: 00:00 does not exist on 5 September 2027, and 23:00-00:00 happens twice on 3 April
      ['America/Santiago', '2027-08-29', '2027-09-12'],
      ['America/Santiago', '2027-03-28', '2027-04-11'],
      ['Asia/Kolkata', '2027-06-01', '2027-06-30']
    ]
    for (const [timezone, from, to] of ranges) {
      for (let run = 0; run < 15; run++) {
        const availability = [0, 1, 2, 3, 4, 5, 6]
          .filter(() => random() < 0.5)
          .map((dayOfWeek) => {
            const start = between(0, 22 * 60)
            return { dayOfWeek, startTime: wallTime(start), endTime: wallTime(between(start + 30, 23 * 60 + 59)) }
          })
        const schedule = makeSchedule({
          timezone,
          durationMinutes: [15, 30, 45, 60][between(0, 3)],
          bufferMinutes: [0, 10][between(0, 1)],
          minNoticeHours: 0,
          availability,
          dateOverrides: [{ date: addDays(from, between(0, 10)), available: false }]
        })
        const rangeStart = wallClockToUTC(from, '00:00', timezone).getTime() - 12 * 3_600_000
        const rangeEnd = wallClockToUTC(addDays(to, 1), '00:00', timezone).getTime() + 12 * 3_600_000
        const busy: BusyBlock[] = Array.from({ length: between(0, 25) }, () => {
          const start = rangeStart + random() * (rangeEnd - rangeStart)
          return {
            start: new Date(start).toISOString(),
            end: new Date(start + random() * 8 * 3_600_000).toISOString()
          }
        })

        const slotsByDate = computeAvailableSlotsByDate(schedule, from, to, busy, JANUARY_1)
        const dates = [...slotsByDate.keys()]
        expect(dates[0]).toBe(from)
        expect(dates.at(-1)).toBe(to)
        dates.slice(1).forEach((date, i) => expect(date).toBe(addDays(dates[i], 1)))
        for (const [date, slots] of slotsByDate) {
          expect({ date, slots }).toEqual({ date, slots: computeAvailableSlots(schedule, date, busy, JANUARY_1) })
        }
      }
    }
  })
})
