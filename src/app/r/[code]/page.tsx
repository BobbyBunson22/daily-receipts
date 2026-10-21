/**
 * A shared roundup: /r/<code>. "Jay’s roundup" as a small player page, with the stories and a way
 * into today's edition. Its link preview is opengraph-image.tsx.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SharedRoundupPage } from '../../../components/RoundupShare';
import { bulletinMinutes } from '../../../lib/reader/bulletin';
import { loadEdition } from '../../../lib/reader/loadEdition';
import { roundupFor } from '../../../lib/reader/name';
import { choiceName } from '../../../lib/reader/voices';
import { ErrorSlip } from '../../ErrorSlip';
import { sharedRoundup } from './roundup';

export const revalidate = 300;

type Props = { params: Promise<{ code: string }> };

const titleOf = (name: string) => (name ? roundupFor(name) : 'A Daily Receipts roundup');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await sharedRoundup((await params).code).catch(() => null);
  if (!r) return {};
  const title = titleOf(r.name);
  const description = `${r.stories.length} ${r.stories.length === 1 ? 'story' : 'stories'}, about ${bulletinMinutes(r.stories, r.edition, r.voice)} min, read by ${choiceName(r.voice)}. Every fact checked against its sources.`;
  return {
    title: { absolute: `${title} · Daily Receipts` },
    description,
    alternates: { canonical: `/r/${r.code}` },
    openGraph: { type: 'website', title, description, url: `/r/${r.code}` },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function SharedRoundup({ params }: Props) {
  let r, today;
  try {
    [r, today] = await Promise.all([sharedRoundup((await params).code), loadEdition()]);
  } catch (e) {
    console.error(e);
    return <ErrorSlip title="This roundup isn't loading" body="Something went wrong on our side. Try again in a minute." />;
  }
  if (!r) redirect('/');
  return <SharedRoundupPage code={r.code} ed={r.edition} stories={r.stories} voice={r.voice} name={r.name} todayIssue={today?.issue ?? r.edition.issue} />;
}
