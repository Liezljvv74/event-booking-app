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
 * them, so filling one later moves neither of the others. The left is the
 * logo, at its own proportions rather than in a box of fixed width: it is
 * given a height and works its width out, so the shape stays exact whatever
 * artwork is put there. The middle takes whatever width is left; the right is
 * as wide as what is put in it and sits hard against the edge.
 */

import Image from "next/image";
/**
 * Imported rather than referenced by its URL, and this matters on GitHub
 * Pages. A project page is served out of a subdirectory, so every asset URL
 * needs that prefix; `next/image` normally adds it in its loader, but the
 * loader is switched off here (`images.unoptimized`, which a static export
 * requires), and `src="/event_diary_logo-horizontal.svg"` then goes out
 * unprefixed and 404s on the deployed site while working perfectly in
 * `next dev`. Importing the file puts it through the build, which applies the
 * prefix — verified by building with a base path set and reading the src out
 * of `out/index.html`.
 *
 * The files stay in `public/`, so replacing the logo is still a matter of
 * dropping a new one over it. Their own width and height come with the
 * import, so nothing here has to restate them.
 *
 * Two of them: the same artwork with the black drawn white, for the dark
 * theme. The wordmark and the four ruled lines are the only solid black in
 * it, and on the near-black header they were a logo with half of it missing.
 * A white plate behind the light one would have fixed that in a line, and
 * did for a while; a logo drawn for the background it is on looks like it
 * belongs there, and a white slab in the corner of a dark page does not.
 */
import logo from "../public/event_diary_logo-horizontal.svg";
import logoDark from "../public/event_diary_logo-horizontal-dark.svg";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-2 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
      {/* Left. The logo names the app — there is no wordmark beside it — so
          its alt text is the app's name rather than empty.

          Both versions are in the markup and the theme picks one, the way
          every other light and dark pair in this app is chosen: `hidden`
          takes the other out of the layout and out of the accessibility
          tree with it, so only one is ever announced, and the alt text sits
          on whichever that is. Both are tiny — under 2 KB each — so the one
          that is never shown costs less than a font would. */}
      <div data-header-logo className="shrink-0">
        <Image
          src={logo}
          alt="Event Diary"
          priority
          /* `block` on both, so neither picks up the sliver of space an
             inline image leaves under its baseline and the bar does not
             shift by a pixel between themes. */
          className="block h-9 w-auto sm:h-10 dark:hidden"
        />
        <Image
          src={logoDark}
          alt="Event Diary"
          priority
          className="hidden h-9 w-auto sm:h-10 dark:block"
        />
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
