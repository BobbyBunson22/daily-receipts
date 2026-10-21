/**
 * A shared story: /s/<story id>-<words from the headline>. Opens today's edition with this
 * story's full receipt on top (from an earlier edition, it says so), and gives the link a
 * preview with the headline (opengraph-image.tsx).
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { App } from '../../../components/App';
import { GRADE_LABELS } from '../../../lib/grading';
import { loadEdition } from '../../../lib/reader/loadEdition';
import { storyPath } from '../../../lib/reader/share';
import { ErrorSlip } from '../../ErrorSlip';
import { sharedStory } from './story';

export const revalidate = 300;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await sharedStory((await params).id).catch(() => null);
  if (!found) return {};
  const { story: s } = found;
  const description = `Grade ${s.grade}, ${GRADE_LABELS[s.grade].label.toLowerCase()}. ${s.stand}`;
  return {
    title: { absolute: `${s.head} · Daily Receipts` },
    description,
    alternates: { canonical: storyPath(s) },
    openGraph: { type: 'article', title: s.head, description, url: storyPath(s) },
    twitter: { card: 'summary_large_image', title: s.head, description },
  };
}

export default async function SharedStoryPage({ params }: Props) {
  let found, today;
  try {
    [found, today] = await Promise.all([sharedStory((await params).id), loadEdition()]);
  } catch (e) {
    console.error(e);
    return <ErrorSlip title="This story isn't loading" body="Something went wrong on our side. Try again in a minute." />;
  }
  if (!found || !today) redirect('/');
  const live = found.edition.id === today.id;
  const secName = found.edition.sections.find((x) => x.id === found.story.sec)?.name;
  return <App edition={today} shared={{ story: { ...found.story, secName }, date: found.edition.date, live }} />;
}
