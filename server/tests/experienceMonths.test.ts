// Month arithmetic of portfolio-common (common/models/experienceMonths.ts): the
// months the experiences page counts on its timeline and in its skill previews,
// shared with the API so both can count the same months. The client's own suites
// (timeline, projectPreview, experienceDates) check the page's use of it.
import { describe, expect, it } from 'bun:test'
import {
  ExperienceType,
  experiencePeriod,
  monthCount,
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
  skillUsesByKey,
  sortExperiences,
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

describe('monthCount', () => {
  it('counts the months of a period, both ends included, as an experience card does', () => {
    expect(monthCount(utc('2024-03'), utc('2024-03'), NOW)).toBe(1)
    expect(monthCount(utc('2022-01'), utc('2024-03'), NOW)).toBe(27)
    expect(monthCount('2024-01-01T00:00:00.000Z', '2024-08-01T00:00:00.000Z', NOW)).toBe(8)
  })

  it('runs to the current month without an end, and to a planned end with one', () => {
    // Mar 2024 to Nov 2026
    expect(monthCount(utc('2024-03'), undefined, NOW)).toBe(33)
    expect(monthCount(utc('2025-09'), utc('2028-06'), NOW)).toBe(34)
    // An experience's: its period's start and end
    const period = experiencePeriod(job('2025-09', '2028-06'))
    expect(monthCount(period.start, period.end, NOW)).toBe(34)
  })

  it('counts nothing without a start, or for an end before the start', () => {
    expect(monthCount(undefined, utc('2024-03'), NOW)).toBe(0)
    expect(monthCount(utc('2025-03'), utc('2024-03'), NOW)).toBe(0)
  })
})

describe('sortExperiences', () => {
  const dated = (id: string, start?: string, end?: string, projects: Project[] = []) => ({ id, ...job(start, end, projects) })

  it('lists ongoing first, then by end and start, the most recent first, undated last', () => {
    const input = [
      dated('undated'),
      dated('old', '2010-01', '2012-01'),
      dated('current-old', '2018-01'),
      dated('recent', '2020-01', '2024-06'),
      dated('current-new', '2023-01'),
      dated('same-end-later-start', '2022-01', '2024-06'),
      dated('from-projects', undefined, undefined, [project('A', '2024-09', '2025-02')])
    ]
    const copy = [...input]
    expect(sortExperiences(input).map(({ id }) => id)).toEqual([
      'current-new',
      'current-old',
      'from-projects',
      'same-end-later-start',
      'recent',
      'old',
      'undated'
    ])
    expect(input).toEqual(copy)
  })

  it('keeps the order of experiences that tie', () => {
    const input = [dated('a', '2020-01', '2021-01'), dated('b', '2020-01', '2021-01'), dated('c'), dated('d')]
    expect(sortExperiences(input).map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd'])
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

describe('skillUsesByKey', () => {
  const portfolio = [
    job('2020-01', '2022-12', [
      project('Long', '2020-01', '2020-12', ['Go', 'Kafka'], ['Leadership']),
      project('Inside', '2020-03', '2020-05', [' go ']),
      project('Across', '2020-11', '2021-02', ['GO'], ['Kafka']),
      project('Undated', undefined, undefined, ['Rust']),
      project('No skills', '2021-01', '2021-06')
    ]),
    job('2025-09', undefined, [project('Ongoing', '2025-09', undefined, ['Rust', 'TypeScript'])]),
    job('2026-01', undefined, [project('Next', '2027-03', undefined, ['Elixir'])]),
    job(undefined, undefined, [project('Lab', undefined, undefined, ['Go', 'Zig'], ['leadership'])]),
    experience(ExperienceType.Personal, '2019-01', '2019-06', [
      project('Side', undefined, '2019-02', ['TypeScript']),
      { name: 'Not populated', hardSkills: [{ skill: '65e2e0000000000000000002' }], softSkills: [] }
    ])
  ]

  it('counts each skill as skillMonths and the projects using it, technical or soft, in one pass', () => {
    const uses = skillUsesByKey(portfolio, NOW)
    expect([...uses.keys()].sort()).toEqual(['elixir', 'go', 'kafka', 'leadership', 'rust', 'typescript', 'zig'])
    for (const [key, use] of uses) {
      expect(use.months).toBe(skillMonths(portfolio, (candidate) => projectUsesSkill(candidate, key), NOW))
      expect(use.projects).toBe(
        portfolio.flatMap((each) => each.projects).filter((candidate) => projectUsesSkill(candidate, key)).length
      )
    }
  })

  it('counts a month once, and a project once however many times it names the skill', () => {
    const uses = skillUsesByKey(portfolio, NOW)
    // Jan 2020 to Feb 2021, and the project without dates counts for nothing
    expect(uses.get('go')).toEqual({ months: 14, projects: 4, placed: 3 })
    // A technical skill of one project and a soft skill of another
    expect(uses.get('kafka')).toEqual({ months: 14, projects: 2, placed: 2 })
    // Jan to Dec 2022 for the project without dates of its job, Sep 2025 to Nov 2026 for the other
    expect(uses.get('rust')).toEqual({ months: 36 + 15, projects: 2, placed: 2 })
    // Planned: used by a project that can be placed, no month yet
    expect(uses.get('elixir')).toEqual({ months: 0, projects: 1, placed: 1 })
    // Used only where nothing can be placed: its months cannot be counted
    expect(uses.get('zig')).toEqual({ months: 0, projects: 1, placed: 0 })
    expect(skillUsesByKey([], NOW).size).toBe(0)
    const twice = [job('2020-01', '2020-03', [project('API', '2020-01', '2020-03', ['Go', 'go'], ['GO'])])]
    expect(skillUsesByKey(twice, NOW).get('go')).toEqual({ months: 3, projects: 1, placed: 1 })
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
