/**
 * Settings inside the same chrome as every other screen: the events down the
 * left, and the section nav with Settings marked as where you are.
 *
 * It reads through the same provider as the event screens, because what it
 * changes is read by them — the retention period decides which events are
 * still there to be listed at all.
 *
 * A Server Component. It holds no state and no handler of its own, so the
 * `"use client"` it used to carry put this module in the browser's bundle for
 * nothing. `AppScreen` is where the client boundary starts, and the page
 * arrives as `children` — passed through rather than imported, so it is
 * rendered on its own terms and pulls nothing into this file's graph.
 */

import { AppScreen } from "@/components/app-chrome";

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppScreen>{children}</AppScreen>;
}
