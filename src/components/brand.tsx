import type { GradeLetter } from '../types/edition';
import { GRADE_LABELS } from '../lib/grading';
import type { ClientStory } from '../lib/reader/types';

/** The torn-slip "DR" logo with a tick. */
export function Logo({ inv = false, className = '' }: { inv?: boolean; className?: string }) {
  return (
    <svg className={`drlogo${inv ? ' inv' : ''} ${className}`} viewBox="0 0 96 120" aria-hidden="true">
      <path className="lg-body" d="M6 10a8 8 0 0 1 8-8h68a8 8 0 0 1 8 8v96l-7 8-7-8-7 8-7-8-7 8-7-8-7 8-7-8-7 8-7-8-7 8-7-8z" />
      <text className="lg-txt" x="48" y="62" textAnchor="middle">DR</text>
      <path className="lg-dash" d="M22 78h52" />
      <path className="lg-tick" d="M34 90l8 7 18-16" />
    </svg>
  );
}

export const Icon = {
  tick: () => (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  heart: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.3s-7.4-4.6-9.5-9C1 8.2 2.9 4.6 6.6 4.6c2 0 3.6 1.1 5.4 3.2 1.8-2.1 3.4-3.2 5.4-3.2 3.7 0 5.6 3.6 4.1 6.7-2.1 4.4-9.5 9-9.5 9z" fill="currentColor" /></svg>
  ),
  cross: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
  ),
  undo: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  keep: () => (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.6-6.5 4.6v-16a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>
  ),
  mic: () => (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="8.5" y="3" width="7" height="11" rx="3.5" fill="currentColor" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
  ),
  close: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
  ),
  settings: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><circle cx="15" cy="7" r="2.3" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="9" cy="17" r="2.3" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>
  ),
  google: () => (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" /><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.1 5.5c4.2-3.9 7.2-9.6 7.2-17z" /><path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.2 0-11.5-4.1-13.4-9.8l-8 6.1C6.6 42.6 14.6 48 24 48z" /></svg>
  ),
};

export function Grade({ grade }: { grade: GradeLetter }) {
  return (
    <span className={`grade g${grade}`} title={`Grade ${grade}: ${GRADE_LABELS[grade].label}`} aria-label={`Grade ${grade}, ${GRADE_LABELS[grade].label}`}>
      {grade}
    </span>
  );
}

export function Facts({ story, n = 3 }: { story: Pick<ClientStory, 'kept'>; n?: number }) {
  return (
    <ul className="facts">
      {story.kept.slice(0, n).map(([fact, support], i) => (
        <li key={i}>
          <span className="tick"><Icon.tick /></span>
          <span>
            {fact}
            <small>{support}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

export const cutLabel = (s: Pick<ClientStory, 'cut'>) => (s.cut.length ? `${s.cut.length} ${s.cut.length === 1 ? 'claim' : 'claims'} cut` : 'Nothing cut');

export function VoiceBadge({ story, name }: { story: ClientStory; name?: string }) {
  if (!story.clip) return null;
  return (
    <span className="vbadge" title={`Read in ${name ?? 'our presenter'}'s AI voice in your roundup`}>
      <Icon.mic />
      {name ? `${name}'s voice` : 'Voiced'}
    </span>
  );
}

/** "Monday, 12 October 2026" → "Mon 12 Oct" */
export const shortDate = (d: string) => d.replace(/^(\w{3})\w*,\s*(\d+)\s+(\w{3})\w*.*$/, '$1 $2 $3');
/** "Monday, 12 October 2026" → "Monday 12 October" */
export const mastDate = (d: string) => d.replace(/,?\s*\d{4}$/, '').replace(',', '');
