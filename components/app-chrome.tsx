"use client";

/**
 * The shell every screen sits inside: the events down the left, the section
 * nav across the top of what is left, and the screen itself beneath it. On a
 * phone the events go back to a strip along the top, where they were before,
 * because a rail beside a 390px screen leaves too little of it.
 *
 * Manage events is one of those screens now, so the shell had to stop being
 * the /event layout's private business. It lives here instead, and both
 * layouts render it — which is what puts the tabs and the nav above Manage
 * events, so reaching it is no longer leaving the app.
 */

import { EventProvider, useEventContext } from "@/components/event-provider";
import { EventTabs } from "@/components/event-tabs";
import { SectionNav } from "@/components/section-nav";

export function ChromeLoading() {
  return (
    <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
      Loading your events…
    </p>
  );
}

/**
 * IndexedDB is the whole store, so failing to open it fails everything.
 *
 * Exported because the entry screen shows it too. That screen loads the
 * events itself rather than through the provider, so it reaches this failure
 * without ever rendering the chrome — and for a while it carried its own
 * word-for-word copy of this, which is two places to keep one sentence right.
 */
export function StorageFailure({ error }: { error: string }) {
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-red-600 dark:text-red-400">
        Could not open local storage
      </h1>
      <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        {error} This app keeps everything in the browser, so it needs
        IndexedDB. Private browsing windows often block it.
      </p>
    </div>
  );
}

interface Props {
  /**
   * The event whose tab is current, or null on the screens that are about
   * all of them and so belong to no tab.
   */
  selectedId: string | null;
  children: React.ReactNode;
}

/**
 * The whole wrapper for a screen that belongs to no event — Manage events and
 * Export/Import — which is the provider and this chrome with no tab current.
 *
 * Next.js wants a `layout.tsx` per route segment, so those two screens cannot
 * share one file; they can share what is in it, and did not, which left the
 * same four lines written twice with nothing to keep them in step.
 */
export function AppScreen({ children }: { children: React.ReactNode }) {
  return (
    <EventProvider>
      <AppChrome selectedId={null}>{children}</AppChrome>
    </EventProvider>
  );
}

export function AppChrome({ selectedId, children }: Props) {
  const { state, error, activeEvents } = useEventContext();

  if (state === "loading") return <ChromeLoading />;
  if (state === "error") return <StorageFailure error={error} />;

  // On Manage events the three event sections still have to point somewhere,
  // and the first active event is the one its own list opens with.
  const navEventId = selectedId ?? activeEvents[0]?.id ?? null;

  return (
    <div className="flex flex-1 flex-col sm:flex-row">
      {/* An empty rail would be a stray border. With nothing active there is
          nothing to switch between, and Manage events is the way back. */}
      {activeEvents.length > 0 && (
        <EventTabs events={activeEvents} selectedId={selectedId} />
      )}

      {/* `min-w-0` so a wide screen inside it scrolls itself rather than
          pushing the rail off the side of the page. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <SectionNav eventId={navEventId} />

        <div className="flex-1 p-2 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
