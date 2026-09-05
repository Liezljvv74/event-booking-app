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
 * The file stays in `public/`, so replacing the logo is still a matter of
 * dropping a new one over it. Its own width and height come with the import,
 * so nothing here has to restate them.
 */
import logo from "../public/event_diary_logo-horizontal.svg";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-2 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
      {/* Left. The logo names the app — there is no wordmark beside it — so
          its alt text is the app's name rather than empty.

          The white plate is for dark mode. The artwork draws "EventDiary"
          and the four lines of the page it sits on in #000000, which on the
          near-black header would be a logo with half of it missing; the plate
          gives it the light ground it was drawn for. It costs nothing in
          light mode, where the header is already white. */}
      <div
        data-header-logo
        className="shrink-0 dark:rounded-md dark:bg-white dark:px-2 dark:py-1"
      >
        <Image
          src={logo}
          alt="Event Diary"
          priority
          className="h-9 w-auto sm:h-10"
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
