"use client";

/**
 * Settings inside the same chrome as every other screen: the events down the
 * left, and the section nav with Settings marked as where you are.
 *
 * It reads through the same provider as the event screens, because what it
 * changes is read by them — the retention period decides which events are
 * still there to be listed at all.
 */

import { AppScreen } from "@/components/app-chrome";

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppScreen>{children}</AppScreen>;
}
