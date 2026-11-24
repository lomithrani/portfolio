import type { Types } from 'mongoose'

// Which of an owner's meeting types (appointment schedules, the Appointments tab) recruiters can
// book: one predicate for every place that says so, the readiness checklist
// (candidateReadiness.ts: the calendar item, the share kit, the landing card's step 4) and the
// meeting types the page for recruiters lists (GET /appointments/domains/:domainName/schedules:
// its "Before you start", its link preview, its booking step), so they always agree.

/**
 * The meeting types of `userId` that offer slots: turned on, with weekly hours or a day of their
 * own with hours (from yesterday on, in UTC: a day that is still today somewhere). A new one
 * starts turned on without hours (AppointmentsTab.svelte): it offers no slot, so it is left out.
 * What a slot also needs (the notice, the calendar's busy times) changes by the hour: not checked
 */
export const bookableScheduleFilter = (userId: string | Types.ObjectId) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return {
    user: userId,
    enabled: true,
    $or: [
      { 'availability.0': { $exists: true } },
      {
        dateOverrides: {
          $elemMatch: { available: true, date: { $gte: yesterday }, 'windows.0': { $exists: true } }
        }
      }
    ]
  }
}
