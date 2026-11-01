import type { Metadata } from "next";
import "./globals.css";
import AppShell from "../components/AppShell";

export const metadata: Metadata = {
  title: {
    template: "%s · TrialFence",
    default: "TrialFence — zk enrollment gate",
  },
  description:
    "Privacy-preserving duplicate-enrollment gate for multi-site clinical trials, built on Semaphore zero-knowledge proofs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
