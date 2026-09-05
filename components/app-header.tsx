/**
 * The bar across the top of every page: a slot for the logo on the left, and
 * two more kept open beside it.
 *
 * Rendered by the root layout rather than by `AppChrome`, so it is there on
 * the entry screen and while the events are still being read out of
 * IndexedDB, and it does not come and go as a screen loads or fails.
 *
 * Nothing in it is interactive yet, so it needs no `"use client"` and stays a
 * server component: the header is in the prerendered HTML, painted before any
 * JavaScript arrives.
 *
 * The three sections hold their places whether or not they have anything in
 * them, so filling one later moves neither of the others. The left is a fixed
 * box the logo will sit in; the middle takes whatever width is left; the
 * right is as wide as what is put in it and sits hard against the edge.
 */

/** The logo box: 2.5rem tall, up to 10rem wide, and empty until the image. */
const LOGO_SLOT = "h-10 w-40 max-w-[45vw]";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-2 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
      {/* Left. Replace the placeholder below with the logo when there is one:
          drop the file in `public/`, then

            <Image src="/logo.png" alt="" width={160} height={40}
                   className="h-10 w-auto object-contain" priority />

          keeping `alt=""` while the logo is decoration beside no wordmark. If
          it becomes the only thing naming the app, give it the app's name as
          its alt text instead. */}
      <div data-header-logo className={`${LOGO_SLOT} shrink-0`}>
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-600"
        >
          Logo
        </div>
      </div>

      {/* Middle. Takes the width the other two do not, and `min-w-0` so
          whatever goes here later shortens itself rather than pushing the
          right-hand section off the page. */}
      <div data-header-middle className="min-w-0 flex-1" />

      {/* Right. Nothing yet, so nothing is drawn; it sits at the end of the
          bar and grows leftwards as it is filled. */}
      <div data-header-right className="flex shrink-0 items-center gap-2" />
    </header>
  );
}
