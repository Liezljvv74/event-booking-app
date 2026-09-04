# Event Booking & Table Manager

A local web app that replaces a physical diary for managing event bookings,
table placements, guest payment status and expenses. One event manager, one
browser, no server.

The build spec lives in [`event-booking-app.md`](event-booking-app.md) and is
the authority on what this is for. This file records what has actually been
built, the decisions taken along the way, and what is still outstanding.

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3002>. Port 3002 is fixed in `package.json`; the
spec pins it.

Or double-click **`open-app.cmd`**, which does the same thing without a
terminal: it installs dependencies on a first run, starts the server, waits
for it to answer and then opens the browser. Closing its window stops the
app. It has to serve the pages rather than open them off the disk, because
they ask for their files by absolute path.

```bash
npm run build     # typecheck, compile, and write the static site to out/
npx tsc --noEmit  # types only
npx eslint .      # lint
```

## Publishing it

`next.config.ts` sets `output: "export"`, so `npm run build` writes a whole
static site into `out/`: plain HTML, CSS and JavaScript with no Node process
behind it. That suits this app exactly, because every event has always lived
in the browser's own IndexedDB and there was never a server to talk to.

`.github/workflows/deploy.yml` builds that output and publishes it. Publishing
that way runs no Jekyll.

It is set to run by hand only, from the Actions tab, because a push trigger
would fail on every commit while Pages is off — see below. The push trigger
is still in the file, commented out, and turning it back on is the last step
of enabling Pages.

Two things have to be true of the repository first, and neither can be done
from inside the workflow:

- **Pages must be switched on**, under **Settings → Pages → Build and
  deployment → Source: GitHub Actions**. The `enablement` option on
  `actions/configure-pages` looks like it would save this step, but creating
  a Pages site needs admin rights the workflow token is not given, so it
  fails with *Resource not accessible by integration*.
- **The repository must be one the plan allows Pages for.** This one is
  private, and Pages for private repositories needs a paid plan; on the free
  plan the repository has to be public. Until one or the other is settled the
  build stops at `configure-pages` with *Your current plan does not support
  GitHub Pages for this repository*.

Everything else is already in place and verified: the export builds, and the
site works when served from a repository subdirectory. So enabling Pages is
three steps — settle the plan or visibility, set the source to GitHub
Actions, then uncomment the push trigger in the workflow.

A project page is served out of a subdirectory named after the repository, so
every asset URL and internal link needs that prefix. The workflow takes it
from `actions/configure-pages` and passes it in as `NEXT_PUBLIC_BASE_PATH`,
which `next.config.ts` hands to Next as `basePath`. Nothing writes the
repository name down, and `npm run dev` passes nothing, so local development
still serves from the root.

`public/.nojekyll` only matters if the site is ever published from a branch
rather than from Actions: Jekyll discards directories that begin with an
underscore, which would take `_next/` and with it the entire application.

### Why the event id moved into the query string

A static export has to write every page to a file at build time. Event ids
are UUIDs minted in the browser, so `/events/[eventId]` could never have had
files to serve, and `next build` refuses the route outright without a
`generateStaticParams()` — for which no list of ids exists, or could.

So the four event screens moved from `/events/<id>/...` to
`/event/...?id=<id>`: one prerendered page per section, each reading the id
off the query string once it is running in the browser. The URLs are less
tidy; in exchange, deep links, reloads and the back and forward buttons all
keep working, which is what the path-based routing was for in the first
place. `lib/event-routes.ts` is the only place that shape is written down.

Because the query string is unknowable at build time, the prerendered HTML
for those pages is the same "Loading your events" line the app already showed
while it read IndexedDB, and the real screen arrives with hydration. That is
what the `Suspense` boundary in `app/event/layout.tsx` is for.

## Non-negotiables

From the spec, and worth keeping in view because several of them are the
reason things are built the way they are:

- **No deployment.** No hosting config, no CI/CD, no deploy scripts.
  **Superseded on request:** the app is now published to GitHub Pages, which
  cost `output: "export"` and `basePath` in `next.config.ts`, one workflow
  file, and the routing change described below. Every other item on this list
  still holds, and the export is static, so there is still no server process,
  no account and no network call.
- **No backend, no accounts.** No server process, no auth, no login.
- **Everything in the browser.** All data lives in IndexedDB. Nothing may be
  lost on refresh, close or reopen.
- **Mobile as well as desktop.** A desktop-only nicety must degrade, never
  break.
- **Minimal dependencies.** Only what the spec needs.

The dependency list is still just Next.js, React and Tailwind. Nothing has
been added to it.

## How it is put together

```
app/
  page.tsx                       the redirect into an event, or to Manage events
  events/manage/
    layout.tsx                   the same chrome, with no tab current
    page.tsx                     create, rename, re-date, re-price, delete
  event/                         one event, chosen by ?id= in the URL
    layout.tsx                   the chrome, around one event's screens
    page.tsx                     dashboard
    tables/page.tsx              tables and seat counts
    bookings/page.tsx            parties, guests, seating
    expenses/page.tsx            expense lines and the saved-line library
components/                      the pieces those screens are built from
  app-chrome.tsx                 event tabs + section nav, shared by both layouts
  ticket-prices-editor.tsx       an event's prices, and the rows behind them
lib/
  db.ts                          IndexedDB plumbing: stores, transactions
  types.ts                       the domain: Event, Table, Booking, Attendee…
  repository.ts                  every read and write, and the rules
  use-events.ts                  the one React hook the screens talk to
  money.ts                       integer cents in, decimal strings out
  ticket-prices.ts               the cheapest price, and how a price reads
  event-time.ts                  dates and clock times
  event-routes.ts                the URL of every event screen, in one place
next.config.ts                   the static export and its base path
.github/workflows/deploy.yml     build, then publish to GitHub Pages
```

Roughly 5,600 lines, 2,000 of them in `lib/`.

### Four things the code leans on

**Money is integer cents, everywhere.** `lib/money.ts` is the only place that
converts to and from the decimal strings a person types or reads. Summing
floats would produce totals like `1249.9999999999998`; integers cannot drift,
so expected profit is an exact subtraction rather than a difference of two
rounded numbers.

**One definition of a free seat.** `tableOccupancy()` in the repository is the
single derivation of who is sitting where and how much room is left. The
Tables screen, the seating dropdowns, the bookings screen's free-seat line and
the dashboard all read it, so they cannot disagree. Anything that needs a
scalar goes through `freeSeatsAtTable()`, which counts the same way.

**The repository holds the rules, not the screens.** Seat capacity, the
four-event ceiling, what may be edited, what a cancellation does — all of it
is enforced in `lib/repository.ts` and surfaced as typed errors
(`TableFullError`, `SeatsBelowOccupancyError`, `CancelledGuestError`,
`NotEnoughFreeSeatsError`, `TooManyActiveEventsError`). The screens disable
what they can and display the error when they cannot, but the rule has one
home.

**Every mutation re-reads the store.** `use-events.ts` writes, then reloads
from IndexedDB and re-renders from that. Screens show what was actually
saved rather than an optimistic guess that could drift from it.

## What each screen does

**Manage events** (`/events/manage`) — the whole lifecycle of an event:
create, rename, change date and times, edit its ticket prices, delete. Each
event is one line — name, then date, start, end and Save to the right of it —
with its ticket prices beneath, and the page is deliberately tight so that as
many events as possible are on the screen at once. Closed events appear here
in their own section and nowhere else in the app, so this is the only place
one can be looked at or removed early. Deleting names what goes with it.

It is the last item in the section nav, after the event's own four, ruled off
from them because those are this event and this is all of them. It used to be
a button among the event tabs, where it read as a fifth event, and the screen
it opened stood outside the app's chrome — reaching it felt like leaving. Now
the tabs and the nav sit above it like they do above every other screen, and
it shares the loaded events with them, so an event created or deleted here
appears or disappears in the tabs at once.

**Dashboard** — the event's ticket prices are read off the heading, after
the name, along with its date and times. Nothing there is editable: an
event's own details are set when it is created and changed on Manage events,
which is one page owning the lot rather than three screens each owning a
piece of it. Then six figures on one line (guests confirmed and cancelled,
seats available, amount due at the venue, expenses, expected income, expected
profit), then the seating list: each table with its seat count, what is free
and who is sitting there. Guests with no name yet are counted rather than
listed. Unseated guests are called out below, because a guest holding no seat
appears in no table's tally.

**Tables** — add and remove tables, and set seats per table. Tables are
shared: several parties sit at one table until its seats run out, so each row
shows what is free and which parties are on it. Cutting a table's seats below
the guests already seated there is refused.

**Bookings** — a party is a name, a telephone number and a guest count, which
generates that many guest lines. Parties collapse to one line each. Guests are
edited individually: name, table, payment status, ticket price. The price a
party is taken at is chosen from the event's own ticket prices, each shown
with what it includes, with **Another amount** for anything off the list; the
cheapest starts selected, so a new guest is priced without anything being
picked. Each guest's own price is the same dropdown, so a guest is moved from
dance-only to dinner by choosing the other price rather than by knowing what
it costs. A party is auto-seated at the table with the least room to spare
that still fits it, so part-filled tables fill before new ones open.

### Ticket prices

An event is sold at a list of prices rather than one, because the same
function is commonly sold two or three ways — dinner and dance against dance
only. Each line is an amount and free text saying what it includes, and the
text is there to be read off when someone asks what they are paying for:
nothing derives from it, and it may be left blank.

The list is entered below the fields on both screens that set an event's
details. The New event form and an event's row on Manage events have the same
shape: the name, then the date, start and end to the right of it, which is
what puts the prices underneath rather than in the middle. Three prices fit
across a line, each an amount, what it includes, and a cross that deletes the
pair; the fields carry no labels of their own, since an amount beside a
description reads as what it is, and three labelled columns would not fit.
Saving replaces the list, so removing a price is expressed by leaving it out.
A line nobody touched is not a price and not a mistake — the create form
opens with one empty — but a line describing something with no amount against
it is refused rather than dropped.

A booking copies an amount out of the list; it does not point at it. So
correcting a price later never rewrites a booking already taken, and a guest's
price stays editable per guest as it always was. Because a guest records an
amount rather than which price it came from, the dropdown that offers the
prices finds the guest's own by matching the amount — and when it matches
none, because it was typed or because the event's prices have since changed,
that amount is offered as an extra line so the field still states what the
guest is being charged.

New guests default to the cheapest price rather than to whichever was entered
first. The cheapest is what a party is quoted unless they ask for the fuller
ticket, so it is the answer that needs no thought in the common case, and a
default nobody looked at then undercharges rather than billing someone for
something they never agreed to.

**Expenses** — a six-column table (description, provider, amount, paid, notes)
edited in place. Only description and amount are required. Clearing a line
saves it to a library that every Description dropdown then offers, minus
whatever is already in the list.

## Decisions worth remembering

The ones that were argued out and would otherwise be re-litigated:

- **A cancelled guest's line closes and a replacement opens.** Cancelling one
  guest does not shrink the party: the line becomes a read-only record and a
  blank line takes its table and price. So the table's occupancy and the
  event's expected income do not move on a cancellation alone. Cancelling a
  *whole party* opens no replacements — the booking is off.
- **Cancelling is the Cancel button's job only.** The status dropdown offers
  the three live statuses. It used to offer Cancelled too, which set the
  status without opening a replacement and quietly took the party's seat away.
- **Un-cancelling is not possible.** It only ever worked as a side effect of
  that dropdown. There is no restore feature.
- **A party is never split across tables automatically.** If no single table
  fits it, it stays unseated and the screen says where the room is. Guests are
  then moved individually or in a batch, which is atomic — three guests sent to
  a table with two free seats move nobody.
- **A saved expense line is offered to at most one line.** Two lines both
  called "Venue hire" would be indistinguishable and would collapse back into
  one library entry the moment either was cleared.
- **A new event starts from the last event saved** — its times and its expense
  lines both, by the same "most recently saved" rule.
- **One page owns an event's own details.** Name, date, times and ticket
  prices are created and changed on Manage events and nowhere else. The
  dashboard used to edit the date and times inline and the entry screen used
  to carry a second New event form; both are gone, so there is one form to
  keep correct rather than three, and the dashboard is what it says it is —
  figures, read.
- **Nothing to open means Manage events.** The entry screen is a signpost: to
  the first active event, or, when there is none, to the one screen that can
  create one.
- **Total number of bookings is deliberately absent** from the dashboard. It is
  spec item 3; it was removed on request in favour of the guest counts.
- **The `by_status` index is unused on purpose.** Events are filtered in
  memory. Dropping the index would leave databases created before and after
  the change with different shapes for no gain.

## Against the spec

| Spec area | State |
|---|---|
| Local, no backend, IndexedDB | Done |
| Up to 4 active events, tabs | Done |
| Every event managed in one place | Done — **not in the spec**, added on request |
| Expenses copied forward to a new event | Done |
| Tables: numbered list, seats per table | Done |
| Bookings, attendees, per-guest editing | Done |
| Cancel a whole party, or one guest | Done |
| Expenses: line items, reuse, permanent delete | Done, minus one thing below |
| Dashboard | Done, minus the bookings total, removed on request |
| Auto-close 48h after the event date | Done — sweep runs on every app start |
| Retention window, then silent delete | Logic done; not changeable without Settings |
| **Settings screen** | **Not built** — retention period, desktop save folder |
| **Export All Data (Excel or JSON)** | **Not built** |
| Ticket prices per event, several with what each includes | Done — **not in the spec**, added on request |
| Permanently delete a saved expense line | **Gone** — it lived in the Saved lines block, removed on request, and the repository function went with the dead-code sweep |
| Mobile | Done — narrow screens scroll their columns sideways rather than breaking |

Out of scope by the spec and not built: visual floor plan, multi-user, any
network call. Deployment tooling was also on that list until the app was
asked to run from GitHub Pages; see **Publishing it** above for what that
added.

## How it has been checked

There is no test suite in the repository. Every change has been verified by
driving the running app in a headless browser — creating events, tables and
bookings, reading the figures back, and checking the console stayed clean.
The most recent pass was 187 assertions across nine scripted scenarios
(cancellations, guest moves, shared tables, the dashboard figures, expenses,
the saved-line library, carried-over times, event management).

Those scripts are **not** checked in. They need `playwright-core`, and the
spec asks for a minimal dependency list, so adding them was not assumed. If
they should live here, that is a decision to take deliberately — it means one
dev dependency and a `scripts/` folder.

Ticket prices were checked the same way, over the built export: creating an
event with two prices, picking one for a booking and confirming the guest
lines took it, typing an amount off the list, editing and removing prices on
Manage events, and confirming a described line with no amount is refused
rather than saved. The version 3 upgrade was tested against a database built
by hand at version 2 — an event stored without any ticket prices came back
with an empty list, its bookings, guests, tables and expenses intact.

Defaulting a new guest to the cheapest price was checked over the built export
in the same way: an event sold at 750, 400 and 900 opened its New booking form
on 400 with the prices still in entry order, and the three guests it created
all arrived on 400; a guest was moved onto another of the event's prices from
their own row; an amount typed behind **Another amount** committed on both
Enter and leaving the field, and came back as the dropdown's shown value; a
guest already on an amount off the list had it offered as an extra line; and
an event whose prices were never set kept the typed price field it has always
had.

Moving Manage events into the section nav was checked over the built export
too, at desktop and phone widths: the nav marks it as where you are and its
four event links carry the event last open; the tabs and the nav sit above
it; an event created there appears in the tabs at once and one deleted there
disappears from them, including the event being looked at; with no events at
all the tab strip is gone, the nav is the Manage events item alone and the
entry screen redirects there; and on a phone the sections scroll while
Manage events stays on screen. The dashboard was confirmed to have no edit
control left on it, showing the date and times as text.

The move to a static export was checked the same way: the contents of `out/`
were served from a subdirectory, mimicking a project page, and the app driven
through it in headless Chrome — creating an event, walking Dashboard, Tables,
Bookings and Expenses, and reloading a section URL directly. Every screen
rendered from IndexedDB with a clean console.

`npm run build`, `npx tsc --noEmit` and `npx eslint .` are all clean.

## A note on AGENTS.md

`AGENTS.md` is written and re-added by `next dev` itself. It is not
hand-maintained; committing it alongside other work keeps the tree clean.
