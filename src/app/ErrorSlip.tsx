import Link from 'next/link';

import { Logo } from '../components/brand';

export function ErrorSlip({ title, body }: { title: string; body: string }) {
  return (
    <main className="page">
      <div className="rcpt">
        <Logo />
        <h1>{title}</h1>
        <p>{body}</p>
        <p><Link className="pill solid" href="/">Try again</Link></p>
      </div>
    </main>
  );
}
