// Calendar date helpers of portfolio-common, shared by the API (range checks
// and clamping of /appointments/available-dates) and the booking page
import { describe, expect, it } from 'bun:test'
import {
  MAX_AVAILABLE_DATES_RANGE,
  addDays,
  bookingHorizon,
  daysBetween,
  isCalendarDate,
  splitDateRange,
  wallDateInTimezone
} from 'portfolio-common'

describe('isCalendarDate', () => {
  it.each(['2027-06-07', '2028-02-29', '2027-12-31', '2027-01-01'])('accepts %s', (date) => {
    expect(isCalendarDate(date)).toBe(true)
  })

  it.each(['2027-02-29', '2027-02-30', '2027-04-31', '2027-13-01', '2027-00-10', '2027-06-00', '2027-6-7', 'tomorrow', ''])(
    'rejects %p',
    (date) => {
      expect(isCalendarDate(date)).toBe(false)
    }
  )
})

describe('addDays and daysBetween', () => {
  it('count calendar days, whatever the DST changes', () => {
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29')
    expect(addDays('2027-10-30', 2)).toBe('2027-11-01')
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2)
    expect(daysBetween('2027-06-07', '2027-06-07')).toBe(0)
    expect(daysBetween('2027-06-07', '2027-06-01')).toBe(-6)
    expect(daysBetween('2027-01-01', '2028-01-01')).toBe(365)
  })
})

describe('wallDateInTimezone', () => {
  it('gives the date of an instant in a time zone', () => {
    const instant = new Date('2027-06-06T23:30:00Z')
    expect(wallDateInTimezone(instant, 'UTC')).toBe('2027-06-06')
    expect(wallDateInTimezone(instant, 'Europe/Paris')).toBe('2027-06-07')
    expect(wallDateInTimezone(instant, 'America/Los_Angeles')).toBe('2027-06-06')
    expect(wallDateInTimezone(new Date('2027-06-06T11:30:00Z'), 'Pacific/Auckland')).toBe('2027-06-06')
    expect(wallDateInTimezone(new Date('2027-06-06T12:30:00Z'), 'Pacific/Auckland')).toBe('2027-06-07')
  })
})

describe('bookingHorizon', () => {
  it('runs from today to today + maxAdvanceDays in the schedule time zone', () => {
    // Monday 7 June 01:30 in Paris, still Sunday 6 June in Los Angeles
    const now = new Date('2027-06-06T23:30:00Z')
    expect(bookingHorizon({ timezone: 'Europe/Paris', maxAdvanceDays: 30 }, now)).toEqual({
      first: '2027-06-07',
      last: '2027-07-07'
    })
    expect(bookingHorizon({ timezone: 'America/Los_Angeles', maxAdvanceDays: 1 }, now)).toEqual({
      first: '2027-06-06',
      last: '2027-06-07'
    })
    // The schema default
    expect(bookingHorizon({ timezone: 'UTC', maxAdvanceDays: null }, now)).toEqual({
      first: '2027-06-06',
      last: '2027-07-06'
    })
  })
})

describe('splitDateRange', () => {
  it('covers the range exactly, in pieces the API accepts', () => {
    expect(splitDateRange('2027-06-07', '2027-06-07')).toEqual([{ from: '2027-06-07', to: '2027-06-07' }])
    // June and July: 61 dates, one request
    expect(splitDateRange('2027-06-01', '2027-07-31')).toEqual([{ from: '2027-06-01', to: '2027-07-31' }])
    expect(splitDateRange('2027-06-08', '2027-06-01')).toEqual([])

    const ranges = splitDateRange('2027-06-07', '2028-06-06')
    expect(ranges[0].from).toBe('2027-06-07')
    expect(ranges.at(-1)?.to).toBe('2028-06-06')
    for (const [i, range] of ranges.entries()) {
      expect(daysBetween(range.from, range.to) + 1).toBeLessThanOrEqual(MAX_AVAILABLE_DATES_RANGE)
      if (i > 0) expect(range.from).toBe(addDays(ranges[i - 1].to, 1))
    }
    expect(ranges).toHaveLength(Math.ceil(366 / MAX_AVAILABLE_DATES_RANGE))
  })
})
