import Link from 'next/link';

import { Logo } from '../components/brand';

export function ErrorSlip({ title, body, action = 'Try again' }: { title: string; body: string; action?: string }) {
  return (
    <main className="page">
      <div className="rcpt">
        <Logo />
        <h1>{title}</h1>
        <p>{body}</p>
        <p><Link className="pill solid" href="/">{action}</Link></p>
      </div>
    </main>
  );
}
