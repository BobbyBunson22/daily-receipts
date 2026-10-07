/**
 * Writes the CSVs scripts/test-db.sh loads to check the database's grading
 * against src/lib/grading.ts: one row per seeded story, and a grid of meters.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { gradeFor, gradeStory, scoreFor } from '../src/lib/grading';
import type { Edition } from '../src/types/edition';

const [editionFile, outDir] = process.argv.slice(2);
const edition = JSON.parse(readFileSync(editionFile, 'utf8')) as Edition;

const stories = edition.stories.map((s) => {
  const g = gradeStory(s);
  const published = edition.computed.find((c) => c.id === s.id)!;
  // Expect the edition's own published grade; grading.test.ts checks the formula agrees.
  return [s.id, g.sources, published.score, published.grade, g.importance.toFixed(1)].join(',');
});
writeFileSync(join(outDir, 'expected_story.csv'), stories.join('\n') + '\n');

const grid: string[] = [];
for (let n = 1; n <= 4; n++)
  for (let c = 0; c <= 100; c++)
    for (let p = 0; p <= 100; p++)
      for (let st = 0; st <= 100; st += 5) {
        const score = scoreFor([c, p, st], n);
        grid.push(`${c},${p},${st},${n},${score},${gradeFor(score)}`);
      }
writeFileSync(join(outDir, 'expected_grid.csv'), grid.join('\n') + '\n');
