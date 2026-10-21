/**
 * A shared roundup: /r/<code>. "Jay’s roundup" as a small player page, with the stories and a way
 * into today's edition. Its link preview is opengraph-image.tsx.
 */
import type { Metadata } from 'next';

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
  const [r, today] = await Promise.all([sharedRoundup((await params).code).catch(() => null), loadEdition().catch(() => null)]);
  if (!r || (today && r.edition.id !== today.id)) return { title: { absolute: 'A finished roundup · Daily Receipts' }, description: "Roundups last a day, like the news. Here's today's edition." };
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
  // roundups last a day, like the news
  if (!r || (today && r.edition.id !== today.id))
    return <ErrorSlip title="This roundup has finished" body="Roundups last a day, like the news. Today's edition is out, and you can make your own roundup from it." action="Read today's news" />;
  return <SharedRoundupPage code={r.code} ed={r.edition} stories={r.stories} voice={r.voice} name={r.name} />;
}
