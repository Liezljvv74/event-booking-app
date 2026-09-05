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

- **Published as static files.** `npm run build` writes the whole site to
  `out/`, and one workflow puts it on GitHub Pages. This replaced the spec's
  original "no deployment, no public URL" rule, on request, and the spec was
  amended to match; it cost `output: "export"` and `basePath` in
  `next.config.ts`, that workflow file, and the routing change described
  below. Nothing else on this list moved — the export is static, so there is
  still no server process, no account and no network call.
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
    page.tsx                     the events on the left, the new-event form on the right
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
  event-routes.ts                the URL of every event screen, and the order of the nav
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

**The repository holds the rules, not the screens.** Seat capacity, what may
be edited, what a cancellation does — all of it is enforced in
`lib/repository.ts` and surfaced as typed errors (`TableFullError`,
`SeatsBelowOccupancyError`, `CancelledGuestError`,
`NotEnoughFreeSeatsError`). The screens disable
what they can and display the error when they cannot, but the rule has one
home.

**Every mutation re-reads the store.** `use-events.ts` writes, then reloads
from IndexedDB and re-renders from that. Screens show what was actually
saved rather than an optimistic guess that could drift from it.

## What each screen does

**Manage events** (`/events/manage`) — the whole lifecycle of an event:
create, rename, change date and times, edit its ticket prices, delete. The
screen is in two columns: **Scheduled Events** on the left, **Schedule a new
event** on the right.

On the left, each event is a single closed line: its name, its date, and a pen
to the right of them. No labels — a name beside a date needs none — and no
fields until they are asked for. The pen opens the event's detail below the
line it was on: name, date, start and end across, ticket prices beneath, and
then Remove event, Cancel and Save. Saving closes the row again, and so does
Cancel and so does the pen, both of which put back what was stored; only a
refused save keeps it open, with the reason showing. Closed events follow
underneath in their own section, collapsed the same way, and appear nowhere
else in the app, so this is the only place one can be looked at or removed
early. Deleting names what goes with it.

On the right, the New event form, permanently. It used to be behind a
`+ New event` button that swapped itself for the form; with the form given a
column of its own the button had nothing left to open, so it is gone, and so
is the Cancel beside Create event, which had nothing left to close. Creating
an event clears the form for the next one — by remounting it, which is also
what re-reads the times to start from, so they come from the event just saved.
Nothing ever disables it: there is no ceiling on how many events may be
scheduled.

Manage events sits between Bookings and Expenses in the section nav, on
request. Before that it was last, after the event's own four and ruled off
from them, because those are this event and this is all of them; the rule went
when it moved, since a divider mid-row would read as a break in the sections
rather than as a note about one of them. Earlier still it was a button among
the event tabs, where it read as a fifth event, and the screen it opened stood
outside the app's chrome — reaching it felt like leaving. The tabs and the nav
sit above it like they do above every other screen, and it shares the loaded
events with them, so an event created or deleted here appears or disappears in
the tabs at once.

**Dashboard** — the event's ticket prices are read off the heading, after
the name, along with its date and times. An event running past midnight is not
marked as such anywhere: 20:00 – 01:30 says it, and the note that used to
follow the end time was asked for off. Nothing there is editable: an
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
generates that many guest lines. Parties collapse to one line each, and the
list runs two abreast on a wide screen so two of them can be read side by
side. Every cancellation on the event is gathered under **Cancelled guests**
below the bookings, each one a name with its party in brackets. Guests are
edited individually: name, table, payment status, ticket price. The price a
party is taken at is chosen from the event's own ticket prices, each shown
with what it includes, with **Another amount** for anything off the list; the
cheapest starts selected, so a new guest is priced without anything being
picked. Each guest's own price is the same dropdown, so a guest is moved from
dance-only to dinner by choosing the other price rather than by knowing what
it costs. A party is auto-seated at the table with the least room to spare
that still fits it, so part-filled tables fill before new ones open; a party
too large for any one table is split across the closest run of tables that
can take it, and the screen says where everyone went.

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

- **A cancelled guest leaves the party and a replacement opens.** Cancelling
  one guest does not shrink the party: a blank line takes the cancelled
  guest's table and price, so the table's occupancy and the event's expected
  income do not move on a cancellation alone. The cancelled guest is out of
  the party's rows altogether and appears under **Cancelled guests** at the
  foot of the screen. Their own price is set to zero when they cancel —
  nobody is charged for a seat they gave up, and the money owed for it is the
  replacement's now. Cancelling a *whole party* opens no replacements — the
  booking is off — and its card stays in the list marked as cancelled, with
  its telephone number still reachable, but shows no table of guest columns
  because it has no live guests to put in them.
- **A cancelled guest is a name and a party, and nothing else.** The table
  they held has gone to their replacement and their price is zero, so the
  columns that used to follow them were a row of dashes. The party in
  brackets is what makes the name findable: two guests called the same thing
  are told apart by whose booking they were on.
- **Cancelling is the Cancel button's job only.** The status dropdown offers
  the three live statuses. It used to offer Cancelled too, which set the
  status without opening a replacement and quietly took the party's seat away.
- **Un-cancelling is not possible.** It only ever worked as a side effect of
  that dropdown. There is no restore feature.
- **A party too big for one table is split across the closest run of tables.**
  It used to stay unseated for the manager to place by hand; splitting it
  automatically was asked for instead. Three rules decide the arrangement, in
  order. *Closest wins:* tables are a numbered list with no floor plan, so
  nearness is the distance between table numbers, and an arrangement spanning
  tables 4 to 5 beats one spanning 2 to 9 even though the second uses fewer
  tables — only a tie on distance is settled by using fewer. *Nobody sits
  alone:* every table used takes at least two of the party, which is what
  turns a party of five at tables of four and four into three and two rather
  than four and one, and which makes a table with a single free seat no use
  to a split party at all. *Each table takes what it can hold:* working up the
  table numbers, each is filled to its free seats before the next is started,
  short of leaving a later one below two.
- **A split party is seated whole or not at all.** Where no arrangement takes
  everyone under those rules — a party of five against tables of four and one
  — nobody is seated and the screen says why. Seating four of them and
  stranding the fifth would leave the manager working out who was missing,
  which is worse than an unseated party the screen can describe.
- **Where a split party went is stated once, in words.** The point of
  splitting automatically is not having to work it out, so the arrangement is
  named table by table after the booking is taken rather than left to be read
  off twelve guest rows. A party that landed at one table is not announced:
  that is where it would have gone anyway, and its rows say so.
- **Guests are moved individually or in a batch**, which is atomic — three
  guests sent to a table with two free seats move nobody.
- **A saved expense line is offered to at most one line.** Two lines both
  called "Venue hire" would be indistinguishable and would collapse back into
  one library entry the moment either was cleared.
- **A new event starts from the last event saved** — its times and its expense
  lines both, by the same "most recently saved" rule.
- **There is no ceiling on how many events may be scheduled.** The spec used
  to cap active events at four; the cap was removed on request and the spec
  amended to match, so `event-booking-app.md` now reads *any number of active
  events*. It was enforced in one place, so removing it took the constant, the
  check in `createEvent`, the `TooManyActiveEventsError` it threw, the
  `atEventLimit` flag the hook published, and the greyed-out form and amber
  note on the screen — the count beside **Scheduled Events** now just counts.
  The tab strip already scrolled and its tabs already refused to shrink, so it
  holds twelve events as readably as it held four.
- **Explanation belongs in a walkthrough, not on the screen.** The New event
  form used to carry a paragraph saying that times and expenses both start
  from the most recent event and that times are optional. It was true and not
  obvious, which is exactly why it read as something to teach a new user once
  rather than something to print above the fields every time they are used.
  Liezl asked for it off and said prose like it belongs in an app walkthrough,
  which is not built. The behaviour it described is unchanged, and is recorded
  here instead.
- **An event in the list is a line, not a form.** Every event used to have
  every one of its fields on show at all times, whether or not any of them
  were being changed, and four events filled the screen. The list is read far
  more often than it is edited, so a row is now its name and date until the
  pen is clicked. Everything that acts on the event — Remove event included —
  lives inside the opened detail, so nothing on a closed row can be set off by
  a stray click while reading down the list, and deleting an event takes two
  deliberate steps before the confirmation is even offered.
- **The row's heading keeps the stored name, not the typed one.** While a
  name is being edited the line above still reads what is saved. It is the
  row's identity in the list rather than a preview of the edit, and it is what
  Cancel puts back.
- **A grid column that must shrink is `minmax(0,1fr)`, never `1fr`.** Both
  two-column screens say so explicitly, the single column below the split
  included. A bare `grid` sizes its implicit column to the widest thing in
  it, and on Bookings that is the 36rem the guest columns need — so the page
  itself began scrolling sideways on a phone instead of the guest rows doing
  it, which is the one thing the spec's mobile rule forbids. It cost nothing
  to fix and would have been easy to ship.
- **The two columns measure themselves, not the window.** An opened event and
  the New event form are the same four fields across, and half of a wide
  window is not the same width as a whole narrow one — so the rows inside each
  column are laid out with container queries (`@xl:`, `@lg:`) against the
  column rather than with `sm:`/`md:` against the viewport. Without that they
  would keep claiming a full-width layout inside a half-width column and
  overflow it. The columns are equal halves, because whatever width one of
  those forms needs the other needs too; the split waits for `xl`, which is
  where half a window is still wide enough for four fields, and below that the
  two columns stack, so a phone gets the screen it always had.
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
| Published as a static export to GitHub Pages | Built and verified; **Pages not switched on yet** — see *Publishing it* |
| Any number of active events, tabs | Done — the spec's cap of 4 was removed on request, and the spec amended to match |
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
network call. Deployment tooling was on that list too until the app was asked
to run from GitHub Pages, and the spec no longer excludes it; see
**Publishing it** above for what that added.

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

The most recent scripts need no dependency at all: Node 24 has a `WebSocket`
built in, which is enough to speak the Chrome DevTools Protocol to a headless
Chrome directly, and a static file server for `out/` is thirty lines of
`node:http`. So checking them in would now cost a `scripts/` folder and
nothing else. Still not assumed, but the dependency argument against it has
gone.

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

Splitting Manage events in two was checked over the built export the same
way, 34 assertions in one pass: both headings present; the form's four fields
and its ticket-price line on screen with nothing clicked; no `+ New event`
button and no Cancel left anywhere; an event created from the right-hand
column arriving in the left-hand list with its name, date, times and price
intact; the form clearing itself afterwards and carrying the times forward
from the event just saved; the nav reading Dashboard, Tables, Bookings,
Manage events, Expenses in that order, on Manage events and on an event's own
screens, marking the right one as current in each case; the columns side by
side at 1600px with an event's row and the form's fields each still on one
line and nothing overflowing sideways, stacked at 800px, and Manage events
still reachable at 390px; the form greying out in place at four active events
with the limit stated and coming back when one is deleted; and three events
read back from IndexedDB after a reload. The console stayed clean throughout.

Collapsing the list was checked the same way, 63 assertions in one pass over
the built export, on top of the split above: a new event arriving collapsed as
its name and date with no fields, no headings and no Save, Cancel, Remove or
Open on the line; the pen sitting to the right of the date, drawn rather than
spelled out, naming the event it edits and reporting whether it is open; the
detail opening with the stored values in it and Save asleep until something
changes; a saved edit closing the row and showing the new name and date on the
line; Cancel and the pen both closing the row and putting back what was stored,
including a ticket price; a refused save staying open with the reason; opening
one row leaving the others closed; Remove event reached only from inside the
detail and still naming what it would delete; three events occupying under
160px between them; and four events surviving a reload still collapsed. At
1600px the columns sit side by side with an opened row's fields on one line,
at 800px they stack, and at 390px the pen is still a 32px target and an opened
row stacks its fields rather than overflowing. The console stayed clean.

Removing the four-event cap was checked in the same pass, which grew to 69
assertions: twelve events created one after another with no refusal, the
fifth — the one the cap used to stop — among them; nothing anywhere on the
page reading *limit*, *already active* or *make room*; the New event form and
every pen still enabled at twelve; the count beside the heading reading
"12 events"; a tab for each of the twelve, with the strip scrolling sideways
rather than pushing the page wide; an event well past the old ceiling opening,
saving an edit and keeping it; and all twelve read back from IndexedDB after a
reload, still collapsed.

Evening up the two columns and taking the prose off the New event form took
the pass to 75 assertions. The added ones: the columns measuring the same
width to the pixel at 1600px and again at 1280px, where the split begins and
each half is at its narrowest; an opened event and the New event form both
still fitting four fields across at that width, with nothing overflowing
sideways; and no trace of the removed paragraph anywhere in the page's text.

Splitting a party across tables has its own pass of 23 assertions, each
scenario built from an empty store: an event, tables given exact seat counts,
then a booking, with every guest's table read back off their own row. It
covers a party that still fits one table going to the tightest one with
nothing said; a party of nine across tables of six and five landing six then
three, in that order down the rows; a party of five across tables of four and
four splitting three and two rather than four and one; a party of five against
tables of four and one staying wholly unseated, with the message naming the
roomiest table; a party of three refusing to split two and one; twelve guests
choosing three neighbouring tables over a closer-packed pair further apart;
fourteen guests filling five, five and four rather than spreading evenly; and
a party splitting around one already seated, taking the three seats left at
its table and seven next door. The messages were checked word for word, and
the split message was confirmed to read in the ordinary text colour while the
unseated one is amber.

Running the bookings list two abreast has its own pass of 20 assertions:
two parties sharing a top edge with the second starting where the first ends
and both the same width; a third wrapping to the next row; both parties open
at once showing all their guest rows without either scrolling sideways, at
1600px and again at 1280px where the split begins; an open party beside a
closed one leaving the closed one its own height rather than a card of empty
space; one column below the split and on a phone, where the page does not
scroll sideways and the guest rows do; and the heading, counts and free-seats
line still running the full width above the list. That pass is what caught
the phone regression described above.

Moving cancellations out of their parties has a pass of 25 assertions, which
reads the stored event straight out of IndexedDB as well as the screen: the
section absent until something is cancelled; a cancelled guest gone from her
party's rows while the party still shows four live guests and the replacement
holds her table; her line reading "Bea (Okonkwo)" and carrying no table,
status or price; the section sitting below every booking; her stored record
cancelled with a ticket price of zero while the replacement keeps the price
she was on; two guests of the same name told apart by their parties; a guest
cancelled before being named still saying which party she was; a wholly
cancelled party keeping its card, its cancelled marking and its telephone
number but showing no empty table of columns, with all five of its records
below and every one of them charged nothing; seven cancellations surviving a
reload; and the section reading one per line on a phone without the page
scrolling sideways. The gutter between two parties was measured at 32px.

`npm run build`, `npx tsc --noEmit` and `npx eslint .` are all clean.

## A note on AGENTS.md

`AGENTS.md` is written and re-added by `next dev` itself. It is not
hand-maintained; committing it alongside other work keeps the tree clean.
