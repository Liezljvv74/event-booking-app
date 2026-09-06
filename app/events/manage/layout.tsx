/**
 * Manage events inside the same chrome as every other screen: the events down
 * the left, and the section nav with Manage events marked as where you are.
 *
 * It reads the events through the same provider as the event screens, so the
 * screen that creates and deletes them shares one loaded copy with the rail
 * that lists them.
 *
 * A Server Component: no state, no handlers, nothing here that needs the
 * browser. `AppScreen` is where the client boundary starts.
 */

import { AppScreen } from "@/components/app-chrome";

export default function ManageEventsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppScreen>{children}</AppScreen>;
}
