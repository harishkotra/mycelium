import type { ReactNode } from "react";
import "./globals.css";

const nav = [
  { href: "/network", label: "Network" },
  { href: "/review", label: "Review" },
  { href: "/agent/alice", label: "Agents" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-border px-6 py-3 flex items-center gap-6">
          <a href="/" className="font-bold text-lg text-primary">
            Mycelium
          </a>
          <nav className="flex gap-4 text-sm">
            {nav.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
