"use client";

/**
 * Manage events inside the same chrome as every other screen: the event tabs
 * above it, and the section nav with Manage events marked as where you are.
 *
 * It reads the events through the same provider as the event screens, so the
 * screen that creates and deletes them shares one loaded copy with the tabs
 * that list them.
 */

import { AppChrome } from "@/components/app-chrome";
import { EventProvider } from "@/components/event-provider";

export default function ManageEventsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <EventProvider>
      {/* No tab is current here: this screen is about all of the events. */}
      <AppChrome selectedId={null}>{children}</AppChrome>
    </EventProvider>
  );
}
