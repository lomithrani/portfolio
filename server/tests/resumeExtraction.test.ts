// Normalisation of what Claude returns for a résumé (services/resumeExtraction.ts):
// the model's output is untrusted, so every cap and rule is enforced here.
import { describe, it, expect } from 'bun:test';
import { ExperienceType } from 'portfolio-common';
import { EXTRACTION_LIMITS, normalizeExtraction } from '../services/resumeExtraction';
import { describeResumeImport, estimateCostUsd } from '../services/resumeImport';

const project = (overrides: Record<string, unknown> = {}) => ({
  name: 'Main work',
  start: '',
  end: '',
  current: false,
  summary: '',
  hardSkills: [] as string[],
  softSkills: [] as string[],
  ...overrides
});

const experience = (overrides: Record<string, unknown> = {}) => ({
  type: 'professional',
  title: 'Engineer',
  company: '',
  location: '',
  start: '',
  end: '',
  current: false,
  summary: '',
  projects: [] as unknown[],
  ...overrides
});

const output = (experiences: unknown[], unplacedSkills: unknown[] = []) => ({ experiences, unplacedSkills });

describe('normalizeExtraction', () => {
  it.each([
    ['undefined (an answer that was not JSON)', undefined],
    ['null', null],
    ['a string', 'experiences'],
    ['an array', [experience()]],
    ['an object without experiences', { unplacedSkills: [] }],
    ['experiences that are not a list', { experiences: 'many' }]
  ])('returns no drafts for %s', (_label, value) => {
    expect(normalizeExtraction(value)).toEqual({
      experiences: [],
      warnings: ['No experiences were found in this file']
    });
  });

  it('keeps optional fields out when empty, and the type in lower case', () => {
    const { experiences, warnings } = normalizeExtraction(output([experience({ type: 'EDUCATIONAL' })]));
    expect(warnings).toEqual([]);
    expect(experiences).toEqual([
      { type: ExperienceType.Educational, title: 'Engineer', current: false, summary: '', projects: [] }
    ]);
  });

  it('skips entries of another shape: unknown type, missing or extra fields, wrong types', () => {
    const { experiences, warnings } = normalizeExtraction(
      output([
        experience({ type: 'job' }),
        { ...experience(), extra: true },
        experience({ current: 'yes' }),
        experience({ projects: [project({ hardSkills: 'TypeScript' })] }),
        42,
        experience({ title: 'Kept' })
      ])
    );
    expect(experiences.map((entry) => entry.title)).toEqual(['Kept']);
    expect(warnings).toEqual(['Skipped 5 entries that came back in an unexpected shape']);
  });

  it('keeps 30 experiences, 20 projects each and 50 skills a list', () => {
    const skills = Array.from({ length: 55 }, (_, index) => `Skill ${index}`);
    const projects = Array.from({ length: 25 }, (_, index) => project({ name: `P${index}`, softSkills: skills }));
    const { experiences, warnings } = normalizeExtraction(
      output(Array.from({ length: 32 }, (_, index) => experience({ title: `E${index}`, projects: index === 0 ? projects : [] })))
    );
    expect(experiences).toHaveLength(EXTRACTION_LIMITS.experiences);
    expect(experiences.at(-1)?.title).toBe('E29');
    expect(experiences[0].projects).toHaveLength(EXTRACTION_LIMITS.projectsPerExperience);
    expect(experiences[0].projects[0].softSkills).toEqual(skills.slice(0, 50));
    expect(warnings).toEqual([
      'Only the first 30 experiences were kept',
      '1 experience has more than 20 projects: only the first 20 of each were kept',
      '20 skill lists have more than 50 skills: only the first 50 of each were kept'
    ]);
  });

  it('says experiences were left out only when one past the 30th would have been kept', () => {
    const thirty = Array.from({ length: 30 }, (_, index) => experience({ title: `E${index}` }));

    // The extra entries would have been skipped anyway: nothing was lost to the cap
    const skippedAnyway = normalizeExtraction(output([...thirty, experience({ title: '  ' }), experience({ type: 'job' })]));
    expect(skippedAnyway.experiences).toHaveLength(30);
    expect(skippedAnyway.warnings).toEqual([
      'Skipped 1 entry that came back in an unexpected shape',
      'Skipped 1 entry without a title'
    ]);

    const lost = normalizeExtraction(output([...thirty, experience({ title: '' }), experience({ title: 'E30' })]));
    expect(lost.experiences.map((entry) => entry.title)).toEqual(thirty.map((entry) => entry.title));
    expect(lost.warnings).toEqual(['Skipped 1 entry without a title', 'Only the first 30 experiences were kept']);
  });

  it('caps each text at what POST /experiences accepts, never splitting a character', () => {
    // An emoji is two UTF-16 code units: cutting at 300 would leave half of one
    const title = `${'a'.repeat(299)}😀 and more`;
    const { experiences, warnings } = normalizeExtraction(
      output([
        experience({
          title,
          company: 'c'.repeat(250),
          location: 'l'.repeat(201),
          summary: 's'.repeat(20_001),
          projects: [project({ name: 'n'.repeat(301), summary: 'p'.repeat(20_000) })]
        })
      ])
    );
    const [draft] = experiences;
    expect(draft.title).toBe('a'.repeat(299));
    expect(draft.company).toHaveLength(200);
    expect(draft.location).toHaveLength(200);
    expect(draft.summary).toHaveLength(20_000);
    expect(draft.projects[0].name).toHaveLength(300);
    expect(draft.projects[0].summary).toHaveLength(20_000);
    expect(warnings).toEqual(['Shortened 5 texts that were too long']);
  });

  it('strips control characters: line breaks kept in summaries, collapsed elsewhere', () => {
    const { experiences } = normalizeExtraction(
      output([
        experience({
          title: 'Lead\u0000\nDeveloper\u0085',
          company: '\tAcme\u001b[31m',
          summary: '- One\r\n- Two\u0000\r- Three\u009b\t(tab kept)',
          projects: [project({ name: 'Core ', hardSkills: ['Type\u0000Script'] })]
        })
      ])
    );
    const [draft] = experiences;
    expect(draft.title).toBe('Lead Developer');
    expect(draft.company).toBe('Acme [31m');
    expect(draft.summary).toBe('- One\n- Two\n- Three\t(tab kept)');
    expect(draft.projects[0].name).toBe('Core');
    expect(draft.projects[0].hardSkills).toEqual(['Type Script']);
  });

  it('dedupes skills case-insensitively (Unicode-normalised), keeping the first spelling', () => {
    const { experiences, warnings } = normalizeExtraction(
      output([
        experience({
          projects: [
            project({
              // "Café" precomposed, then with a combining accent
              hardSkills: ['Node.js', 'node.js', ' NODE.JS ', 'Café', 'Café', '', '   ', 'x'.repeat(101), 'y'.repeat(100)],
              softSkills: ['Mentoring', 'mentoring']
            })
          ]
        })
      ])
    );
    expect(experiences[0].projects[0].hardSkills).toEqual(['Node.js', 'Café', 'y'.repeat(100)]);
    expect(experiences[0].projects[0].softSkills).toEqual(['Mentoring']);
    expect(warnings).toEqual(['Left out 1 skill name longer than 100 characters']);
  });

  it.each([
    ['2020-01', '2020-01'],
    ['1900-01', '1900-01'],
    ['2100-12', '2100-12'],
    [' 2021-07 ', '2021-07'],
    ['2020-00', undefined],
    ['2020-13', undefined],
    ['1899-12', undefined],
    ['2101-01', undefined],
    ['2020-1', undefined],
    ['2020', undefined],
    ['2020-01-15', undefined],
    ['Jan 2020', undefined],
    ['present', undefined]
  ])('takes %p as a start month: %p', (start, expected) => {
    const { experiences, warnings } = normalizeExtraction(output([experience({ start })]));
    expect(experiences[0].start).toBe(expected);
    expect(warnings).toEqual(expected ? [] : ['Left out 1 date that is not a valid month (YYYY-MM)']);
  });

  it('drops the end of an ongoing experience and an end before the start', () => {
    const { experiences, warnings } = normalizeExtraction(
      output([
        experience({ start: '2020-05', end: '2021-01', current: true }),
        experience({ start: '2020-05', end: '2020-04' }),
        experience({ start: '2020-05', end: '2020-05' }),
        experience({ start: '', end: '2020-05' })
      ])
    );
    expect(experiences.map(({ start, end, current }) => ({ start, end, current }))).toEqual([
      { start: '2020-05', end: undefined, current: true },
      { start: '2020-05', end: undefined, current: false },
      { start: '2020-05', end: '2020-05', current: false },
      { start: undefined, end: '2020-05', current: false }
    ]);
    expect(warnings).toEqual(['Left out 1 end date before the start date']);
  });

  it('names an unnamed project after its experience', () => {
    const { experiences } = normalizeExtraction(
      output([experience({ title: 'Data Engineer', projects: [project({ name: '  ' })] })])
    );
    expect(experiences[0].projects[0].name).toBe('Data Engineer');
  });

  it('lists the skills tied to no experience (20 at most), ignoring what is not a name', () => {
    const many = Array.from({ length: 25 }, (_, index) => `Tool ${index}`);
    expect(normalizeExtraction(output([experience()], [...many, 'tool 0', 7, ''])).warnings).toEqual([
      `Skills listed on the résumé but not tied to any experience were left out: ${many.slice(0, 20).join(', ')} and 5 more`
    ]);
    expect(normalizeExtraction(output([experience()], ['', '  '])).warnings).toEqual([]);
    expect(normalizeExtraction({ experiences: [experience()], unplacedSkills: 'Docker' }).warnings).toEqual([]);
  });
});

describe('estimateCostUsd', () => {
  it('prices Claude Haiku 5.5 on the standard rate card up to a 100K-token prompt', () => {
    expect(estimateCostUsd({ input_tokens: 10_000, output_tokens: 2_000, cache_creation_input_tokens: null, cache_read_input_tokens: null })).toBe(0.002);
    expect(estimateCostUsd({ input_tokens: 100_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })).toBe(0.01);
  });

  it('switches to the long-prompt rate card above 100K prompt tokens', () => {
    // 200,000 × $0.50 + 2,000 × $2.50 per million tokens
    expect(estimateCostUsd({ input_tokens: 200_000, output_tokens: 2_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })).toBe(0.105);
    // Cached prompt tokens count toward the 100K threshold
    expect(estimateCostUsd({ input_tokens: 1_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 100_000 })).toBe(0.0005);
  });
});

describe('describeResumeImport', () => {
  it('says whether the feature is on, and why not, never with the key', () => {
    const key = 'sk-ant-api03-secret';
    const on = {
      ANTHROPIC_API_KEY: key,
      RESUME_IMPORT_MONTHLY_LIMIT: 3,
      RESUME_IMPORT_DAILY_LIMIT: 30,
      RESUME_IMPORT_ATTEMPTS_PER_DAY: 10
    };
    expect(describeResumeImport({ ...on, ANTHROPIC_API_KEY: undefined })).toBe('off (no ANTHROPIC_API_KEY)');
    expect(describeResumeImport({ ...on, RESUME_IMPORT_MONTHLY_LIMIT: 0 })).toBe('off (RESUME_IMPORT_MONTHLY_LIMIT=0)');
    expect(describeResumeImport({ ...on, RESUME_IMPORT_DAILY_LIMIT: 0 })).toBe('off (RESUME_IMPORT_DAILY_LIMIT=0)');
    expect(describeResumeImport({ ...on, RESUME_IMPORT_ATTEMPTS_PER_DAY: 0 })).toBe('off (RESUME_IMPORT_ATTEMPTS_PER_DAY=0)');
    expect(describeResumeImport(on)).toBe('on (3 per user per 30 days, 30 per day, 10 attempts per user per day)');
  });
});
