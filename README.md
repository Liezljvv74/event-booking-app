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

```bash
npm run build     # typecheck and compile, to prove it builds
npx tsc --noEmit  # types only
npx eslint .      # lint
```

## Non-negotiables

From the spec, and worth keeping in view because several of them are the
reason things are built the way they are:

- **No deployment.** No hosting config, no CI/CD, no deploy scripts.
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
  page.tsx                       first run, and the redirect into an event
  events/manage/page.tsx         create, rename, re-date, delete any event
  events/[eventId]/
    layout.tsx                   event tabs + section nav (the chrome)
    page.tsx                     dashboard
    tables/page.tsx              tables and seat counts
    bookings/page.tsx            parties, guests, seating
    expenses/page.tsx            expense lines and the saved-line library
components/                      the pieces those screens are built from
lib/
  db.ts                          IndexedDB plumbing: stores, transactions
  types.ts                       the domain: Event, Table, Booking, Attendee…
  repository.ts                  every read and write, and the rules
  use-events.ts                  the one React hook the screens talk to
  money.ts                       integer cents in, decimal strings out
  event-time.ts                  dates and clock times
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
create, rename, change date and times, delete. Closed events appear here in
their own section and nowhere else in the app, so this is the only place one
can be looked at or removed early. Deleting names what goes with it.

**Dashboard** — six figures on one line (guests confirmed and cancelled,
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
edited individually: name, table, payment status, ticket price. A party is
auto-seated at the table with the least room to spare that still fits it, so
part-filled tables fill before new ones open.

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
| Permanently delete a saved expense line | **Gone** — it lived in the Saved lines block, removed on request, and the repository function went with the dead-code sweep |
| Mobile | Done — narrow screens scroll their columns sideways rather than breaking |

Out of scope by the spec and not built: visual floor plan, multi-user, any
network call, any deployment tooling.

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

`npm run build`, `npx tsc --noEmit` and `npx eslint .` are all clean.

## A note on AGENTS.md

`AGENTS.md` is written and re-added by `next dev` itself. It is not
hand-maintained; committing it alongside other work keeps the tree clean.
