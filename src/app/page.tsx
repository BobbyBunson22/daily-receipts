import type { Metadata } from 'next';

import { App } from '../components/App';
import { mastDate } from '../components/brand';
import { loadEdition } from '../lib/reader/loadEdition';
import { ErrorSlip } from './ErrorSlip';

// The edition changes once a morning; re-check every five minutes.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  try {
    const ed = await loadEdition();
    if (!ed) return {};
    const line = `No. ${ed.issue} · ${mastDate(ed.date)} · ${ed.stories.length} stories, each checked against the sources.`;
    return {
      title: { absolute: `Today's Daily Receipts · ${mastDate(ed.date)}` },
      description: line,
      openGraph: { title: `Today's Daily Receipts · ${mastDate(ed.date)}`, description: line },
    };
  } catch {
    return {};
  }
}

export default async function Home() {
  let edition;
  try {
    edition = await loadEdition();
  } catch (e) {
    console.error(e);
    return <ErrorSlip title="Today's edition isn't loading" body="Something went wrong on our side. Try again in a minute." />;
  }
  if (!edition) return <ErrorSlip title="No edition yet" body="The first edition hasn't been published. Check back after 6am." />;
  return <App edition={edition} />;
}
