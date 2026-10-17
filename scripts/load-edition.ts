/**
 * Loads an edition JSON file into Supabase. Used by the "Load edition" GitHub Action.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run edition:load -- data/edition-2026-10-12.json
 *
 * The edition is cleaned (http links → https), validated, and only then sent. The database
 * computes every grade itself; nothing here sets one.
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { prepareEdition } from '../src/lib/prepareEdition';
import { validateEdition } from '../src/lib/validateEdition';
import type { Edition } from '../src/types/edition';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Give the edition file, e.g. data/edition-2026-10-12.json');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  const { edition, notes } = prepareEdition(JSON.parse(readFileSync(file, 'utf8')) as Edition);
  notes.forEach((n) => console.log(`note: ${n}`));
  const { ok, errors } = validateEdition(edition);
  if (!ok) {
    console.error(`${file} is not a valid edition. Nothing was loaded.\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('dr_load_edition', { e: edition, publish: true });
  if (error) {
    console.error(`Loading failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Loaded issue ${edition.edition.issue} (${edition.edition.date}): ${edition.stories.length} stories, edition id ${data}.`);

  // "Also reported by" links: saved here as well, so they arrive whichever version of
  // dr_load_edition the database has. They never touch sources or grades.
  let links = 0;
  for (const s of edition.stories) {
    const also = s.also ?? [];
    const { error: e2 } = await db.from('stories').update({ also }).eq('edition_id', data).eq('slug', s.id);
    if (e2) {
      console.warn(`"Also reported by" links not saved (${e2.message}); the edition itself is loaded.`);
      break;
    }
    links += also.length;
  }
  console.log(`"Also reported by" links: ${links}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
