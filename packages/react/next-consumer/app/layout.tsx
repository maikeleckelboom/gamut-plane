import type { ReactNode } from "react";
import Link from "next/link";
import "@gamut-plane/react/style.css";
import { EventsProvider } from "../eventsProvider";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <nav>
            <Link href="/">Instruments</Link> <Link href="/away">Away</Link>{" "}
            <Link href="/prerendered">Prerendered</Link>
          </nav>
          <EventsProvider>{children}</EventsProvider>
        </main>
      </body>
    </html>
  );
}
