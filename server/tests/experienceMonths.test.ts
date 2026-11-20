// Month arithmetic of portfolio-common (common/models/experienceMonths.ts): the
// months the experiences page counts on its timeline and in its skill previews,
// shared with the API so both can count the same months. The client's own suites
// (timeline, projectPreview, experienceDates) check the page's use of it.
import { describe, expect, it } from 'bun:test'
import {
  ExperienceType,
  experiencePeriod,
  monthIndex,
  normalizeSkill,
  periodMonths,
  placeProject,
  professionalMonths,
  projectEnd,
  projectMonthSpan,
  projectUsesSkill,
  skillDisplayName,
  skillMonths,
  toDate
} from 'portfolio-common'

const utc = (month: string) => new Date(`${month}-01T00:00:00.000Z`)
const m = (month: string) => monthIndex(utc(month))
const NOW = new Date('2026-11-11T10:00:00.000Z')
const skills = (names: string[]) => names.map((name) => ({ skill: { displayName: name } }))

type Project = { name: string; start?: Date; end?: Date; hardSkills?: object[]; softSkills?: object[] }

const project = (name: string, start?: string, end?: string, hard: string[] = [], soft: string[] = []): Project => ({
  name,
  start: start ? utc(start) : undefined,
  end: end ? utc(end) : undefined,
  hardSkills: skills(hard),
  softSkills: skills(soft)
})

const experience = (
  type: ExperienceType,
  start: string | undefined,
  end: string | undefined,
  projects: Project[] = []
) => ({
  type,
  start: start ? utc(start) : undefined,
  end: end ? utc(end) : undefined,
  projects
})

const job = (start?: string, end?: string, projects: Project[] = []) =>
  experience(ExperienceType.Professional, start, end, projects)

describe('toDate and monthIndex', () => {
  it('read a Date or its ISO string, in UTC', () => {
    expect(toDate('2024-03-01T00:00:00.000Z')).toEqual(utc('2024-03'))
    expect(toDate(utc('2024-03'))).toEqual(utc('2024-03'))
    expect(monthIndex(utc('2024-03'))).toBe(2024 * 12 + 2)
    // The last hour of February in UTC is still February, whatever the time zone
    expect(monthIndex(new Date('2024-02-29T23:30:00.000Z'))).toBe(m('2024-02'))
  })

  it.each([undefined, null, '', 'not a date'])('gives nothing for %p', (value) => {
    expect(toDate(value)).toBeUndefined()
  })
})

describe('experiencePeriod and projectEnd', () => {
  it('takes the period of an experience without a start from its projects', () => {
    expect(
      experiencePeriod({ projects: [project('A', '2021-02', '2021-06'), project('B', '2020-05', '2020-09')] })
    ).toEqual({ start: utc('2020-05'), end: utc('2021-06'), ongoing: false })
    expect(experiencePeriod({ projects: [project('A', '2021-02')] })).toEqual({ start: utc('2021-02'), ongoing: true })
    expect(experiencePeriod({ projects: [project('Undated')] })).toEqual({ ongoing: false })
  })

  it('stops a project without an end with its experience, never before it began', () => {
    const ended = experiencePeriod(job('2019-01', '2020-12'))
    expect(projectEnd({ start: utc('2019-06') }, ended)).toEqual(utc('2020-12'))
    expect(projectEnd({ start: utc('2021-03') }, ended)).toEqual(utc('2021-03'))
    expect(projectEnd({ start: utc('2019-06') }, experiencePeriod(job('2019-01')))).toBeUndefined()
  })
})

describe('periodMonths and placeProject', () => {
  it('runs an ongoing experience to the current month, a planned one takes its first month', () => {
    expect(periodMonths(experiencePeriod(job('2025-01')), m('2026-11'))).toEqual({
      start: m('2025-01'),
      last: m('2026-11')
    })
    expect(periodMonths(experiencePeriod(job('2027-03')), m('2026-11'))).toEqual({
      start: m('2027-03'),
      last: m('2027-03')
    })
    expect(periodMonths(experiencePeriod(job(undefined, '2020-01')), m('2026-11'))).toBeUndefined()
  })

  it('places a project without a start over its experience, unless it has an end', () => {
    const period = experiencePeriod(job('2020-01', '2022-12'))
    const own = { start: m('2020-01'), last: m('2022-12') }
    expect(placeProject({}, period, own, m('2026-11'))).toEqual({ ...own, ongoing: false, undated: true })
    expect(placeProject({ end: utc('2020-06') }, period, own, m('2026-11'))).toEqual({
      start: m('2020-01'),
      last: m('2020-06'),
      ongoing: false,
      undated: true
    })
  })
})

describe('projectMonthSpan', () => {
  it('gives the months of a project, its last month included', () => {
    expect(projectMonthSpan(project('Short', '2021-03', '2021-05'), job('2020-01', '2022-12'), NOW)).toEqual({
      start: m('2021-03'),
      end: m('2021-06')
    })
  })

  it('cannot place a project of an experience without dates', () => {
    expect(projectMonthSpan(project('Lab'), job(undefined, undefined, [project('Lab')]), NOW)).toBeUndefined()
  })
})

describe('skills', () => {
  it('match ignoring case and surrounding spaces', () => {
    expect(normalizeSkill('  TypeScript ')).toBe('typescript')
    const used = project('API', '2021-01', '2021-02', ['Kafka'], ['Leadership'])
    expect(projectUsesSkill(used, ' kafka')).toBe(true)
    expect(projectUsesSkill(used, 'LEADERSHIP')).toBe(true)
    expect(projectUsesSkill(used, 'go')).toBe(false)
  })

  it('are read from populated entries only', () => {
    expect(skillDisplayName({ skill: { displayName: ' Go ' } })).toBe('Go')
    expect(skillDisplayName({ skill: { displayName: '  ' } })).toBeUndefined()
    // Not populated: an id
    expect(skillDisplayName({ skill: '65e2e0000000000000000002' })).toBeUndefined()
    expect(skillDisplayName({})).toBeUndefined()
    expect(projectUsesSkill({ hardSkills: [{ skill: 'kafka' }], softSkills: null }, 'kafka')).toBe(false)
  })
})

describe('skillMonths', () => {
  const usesGo = (candidate: Project) => projectUsesSkill(candidate, 'go')
  const go = (name: string, start?: string, end?: string) => project(name, start, end, ['Go'])

  it('counts a month once, however many projects using the skill ran that month', () => {
    const experiences = [
      job('2020-01', '2022-12', [
        project('Long', '2020-01', '2020-12', ['Go']),
        project('Inside', '2020-03', '2020-05', ['Go']),
        project('Across', '2020-11', '2021-02', ['Go']),
        project('Other', '2022-01', '2022-12', ['Rust'])
      ])
    ]
    // Jan 2020 to Feb 2021
    expect(skillMonths(experiences, usesGo, NOW)).toBe(14)
  })

  it('reads the skill from the predicate it is given', () => {
    const experiences = [job('2020-01', '2020-12', [project('API', '2020-01', '2020-03', ['Go'])])]
    expect(skillMonths(experiences, () => true, NOW)).toBe(3)
    expect(skillMonths(experiences, () => false, NOW)).toBe(0)
  })

  it("gives a project without dates its experience's, and counts nothing after the current month", () => {
    expect(skillMonths([job('2020-01', '2022-12', [go('Undated')])], usesGo, NOW)).toBe(36)
    // Planned to Jun 2028: Sep 2025 to Nov 2026 so far
    expect(skillMonths([job('2025-09', '2028-06', [go('Thesis', '2025-09', '2028-06')])], usesGo, NOW)).toBe(15)
    // Not started yet
    expect(skillMonths([job('2026-01', undefined, [go('Next', '2027-03')])], usesGo, NOW)).toBe(0)
  })

  it('counts nothing for the projects of an experience without dates', () => {
    expect(skillMonths([job(undefined, undefined, [go('Lab')])], usesGo, NOW)).toBe(0)
  })
})

describe('professionalMonths', () => {
  it('counts the months of professional experiences only', () => {
    const experiences = [
      job('2020-01', '2020-12'),
      experience(ExperienceType.Educational, '2015-09', '2019-06'),
      experience(ExperienceType.Personal, '2021-01', '2021-12'),
      experience(ExperienceType.Leisure, '2010-01', '2025-12')
    ]
    expect(professionalMonths(experiences, NOW)).toBe(12)
  })

  it('counts a month once when two jobs ran at the same time', () => {
    expect(professionalMonths([job('2020-01', '2020-12'), job('2020-07', '2021-06')], NOW)).toBe(18)
    // A handoff: the next job starts the month the first one ends
    expect(professionalMonths([job('2020-01', '2020-06'), job('2020-06', '2020-12')], NOW)).toBe(12)
  })

  it('runs an ongoing job to the current month, and counts nothing after it', () => {
    // Oct 2021 to Nov 2026
    expect(professionalMonths([job('2021-10')], NOW)).toBe(62)
    expect(professionalMonths([job('2026-09', '2027-08')], NOW)).toBe(3)
    expect(professionalMonths([job('2027-01')], NOW)).toBe(0)
  })

  it('takes the period of a job without a start from its projects, and counts none for an undated one', () => {
    const fromProjects = job(undefined, undefined, [
      project('A', '2019-01', '2019-03'),
      project('B', '2019-06', '2019-08')
    ])
    expect(professionalMonths([fromProjects], NOW)).toBe(8)
    expect(professionalMonths([job(undefined, '2020-01', [project('Undated')])], NOW)).toBe(0)
    expect(professionalMonths([], NOW)).toBe(0)
  })

  it('reads stored dates written as ISO strings', () => {
    const stored = {
      type: ExperienceType.Professional,
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-06-01T00:00:00.000Z',
      projects: []
    }
    expect(professionalMonths([stored], NOW)).toBe(6)
  })
})
