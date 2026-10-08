import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrialFence",
  description:
    "Privacy-preserving duplicate-enrollment gate for multi-site clinical trials, built on Semaphore zero-knowledge proofs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="logo">
            <span>TrialFence</span>&nbsp;· zk enrollment gate
          </div>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/volunteer">Volunteer</Link>
            <Link href="/coordinator">Coordinator</Link>
            <Link href="/sponsor">Sponsor / IRB</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site">
          TrialFence — no name, no document number ever leaves the coordinator. Enrollment is proven with a
          Semaphore zero-knowledge proof bound to the protocol.
        </footer>
      </body>
    </html>
  );
}