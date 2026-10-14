'use client';
import { FeedbackForm } from './FeedbackForm';
import { useReader } from './ReaderContext';
import { SavedList } from './SavedList';

/** What sits under the end-of-edition slip: saved list, a sign-up nudge, and feedback. */
export function EndExtras() {
  const { st, user, setOverlay } = useReader();
  return (
    <>
      {st.saves.length > 0 && (
        <section className="saved" id="saved" aria-labelledby="saved-h">
          <h2 id="saved-h">Saved for later</h2>
          <p className="muted">{st.saves.length} {st.saves.length === 1 ? 'story' : 'stories'}, kept until you remove them. Tap one to read it.</p>
          <SavedList />
        </section>
      )}
      {!user && (
        <section className="nudge" aria-labelledby="nudge-h">
          <h2 id="nudge-h">Keep your receipts</h2>
          <p>Sign up free and your roundup, saves and topics follow you to every device. No password: we email you a link.</p>
          <div className="endbtns"><button className="pill solid" onClick={() => setOverlay({ kind: 'account', reason: 'end' })}>Sign up or sign in</button></div>
        </section>
      )}
      <FeedbackForm />
    </>
  );
}
