import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { messageProblems, messageSource } from 'portfolio-common';

// Every text the API answers with is a message in English and French (docs/I18N.md), declared
// in a `*.messages.ts` file of the server or of portfolio-common
const roots = [resolve(import.meta.dir, '..'), resolve(import.meta.dir, '../../common')];

const files = roots.flatMap((root) =>
  [...new Bun.Glob('**/*.messages.ts').scanSync({ cwd: root, absolute: true })].filter(
    (file) => !file.includes('/node_modules/')
  )
);

describe('message files', () => {
  test('there are message files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)('%s is complete in both languages', async (file) => {
    const module = (await import(file)) as Record<string, unknown>;
    const declarations = Object.values(module)
      .map(messageSource)
      .filter((source) => source !== undefined);
    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.flatMap((source) => messageProblems(source))).toEqual([]);
  });
});
