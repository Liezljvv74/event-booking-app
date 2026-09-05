"use client";

/**
 * Export and import inside the same chrome as every other screen: the events
 * down the left, and the section nav with this item marked as where you are.
 *
 * It reads through the same provider as the event screens, so the screen that
 * writes every event to a file and reads a file back shares one loaded copy
 * with the rail that lists them — an import appears there as it lands.
 */

import { AppScreen } from "@/components/app-chrome";

export default function DataLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppScreen>{children}</AppScreen>;
}
