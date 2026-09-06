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

So the event's screens moved from `/events/<id>/...` to
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
  data/
    layout.tsx                   the same chrome again
    page.tsx                     export on the left, import on the right
  settings/
    layout.tsx                   and again
    page.tsx                     how long closed events are kept, and the export folder
  event/                         one event, chosen by ?id= in the URL
    layout.tsx                   the chrome, around one event's screens
    page.tsx                     dashboard
    bookings/page.tsx            parties, guests, seating
    expenses/page.tsx            expense lines and the saved-line library
components/                      the pieces those screens are built from
  app-header.tsx                 the bar across the top: logo slot, and two open
  app-chrome.tsx                 the event rail + section nav, under all three layouts
  ticket-prices-editor.tsx       an event's prices, and the rows behind them
  tables-editor.tsx              an event's tables, and the rows behind them
  form-styles.ts                 one definition of what a form field looks like
lib/
  db.ts                          IndexedDB plumbing: stores, transactions
  data-transfer.ts               the file formats — backup, reports, door list — no DOM
  file-access.ts                 the folder picker, the remembered handle, the download
  types.ts                       the domain: Event, Table, Booking, Attendee…
  repository.ts                  every read and write, and the rules
  use-events.ts                  the one React hook the screens talk to
  money.ts                       integer cents in, decimal strings out
  ticket-prices.ts               the cheapest price, and how a price reads
  event-time.ts                  dates and clock times
  currency.ts                    the currencies offered, and how one reads
  event-routes.ts                the URL of every screen, and the order of the nav
  errors.ts                      what to show when something throws
public/
  event_diary_logo-horizontal.svg       the logo, dark on light
  event_diary_logo-horizontal-dark.svg  the same drawing, light on dark
next.config.ts                   the static export and its base path
.github/workflows/deploy.yml     build, then publish to GitHub Pages
```

Roughly 8,500 lines, 3,600 of them in `lib/`.

### Four things the code leans on

**Money is integer cents, everywhere.** `lib/money.ts` is the only place that
converts to and from the decimal strings a person types or reads. Summing
floats would produce totals like `1249.9999999999998`; integers cannot drift,
so expected profit is an exact subtraction rather than a difference of two
rounded numbers.

**One definition of a free seat.** `tableOccupancy()` in the repository is the
single derivation of who is sitting where and how much room is left. The
seating dropdowns, the bookings screen's free-seat line, the dashboard and
the crosses on Manage events that say what removing a table would unseat all
read it, so they cannot disagree. Anything that needs a
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

Every screen sits in the same shell: the app header across the top, the
active events down the left-hand side beneath it, the section nav across the
top of what is left, and the screen itself under that.

The header is three sections. The left is the logo, 2.5rem tall and as wide
as its own proportions make it — given a height and left to work the width
out, so the shape stays exact whatever artwork is put there. There are two of
them, the same drawing with the black drawn white, and the theme picks one:
the wordmark and the four ruled lines are the only solid black in the artwork,
and on the near-black header they were a logo with half of it missing. A white
plate behind the light version fixed that in a line and did for a while, but a
logo drawn for the background it is on looks like it belongs there and a white
slab in the corner of a dark page does not. The middle takes whatever width the other two leave, and the right
sits hard against the edge; both are empty for now and each holds its place,
so filling one later moves neither of the others. It is rendered by the root layout rather than by
`AppChrome`, which means it is on the entry screen and on the loading and
storage-failure states too — screens that render none of the app's own
chrome — and it needs no `"use client"`, so it is in the prerendered HTML
before any JavaScript arrives. The events were a strip of tabs along the top until they were
asked to the left, which suits them — a list of events is read down rather
than across, a long name has the column's width rather than a tab's, and
switching event is a fixed place to look however many are open. Each carries
its name and its date, and nothing else; the times used to follow the date and
were asked off, the dashboard heading being where an event's hours are read.
Below `sm` the rail goes back to being that strip, because a column beside a
390px screen leaves too little of it for the screen.

**Manage events** (`/events/manage`) — the whole lifecycle of an event:
create, rename, change date and times, edit its ticket prices, delete. The
screen is in two columns: **Scheduled Events** on the left, **Schedule a new
event** on the right.

On the left, each event is a single closed line: its name, its date, and a pen
to the right of them. No labels — a name beside a date needs none — and no
fields until they are asked for. The pen opens the event's detail below the
line it was on: name, date, start and end across, ticket prices beneath, the
event's tables under those, and then Remove event, Cancel and Save. Saving closes the row again, and so does
Cancel and so does the pen, both of which put back what was stored; only a
refused save keeps it open, with the reason showing. Closed events follow
underneath in their own section, collapsed the same way, and appear nowhere
else in the app, so this is the only place one can be looked at or removed
early. Deleting names what goes with it.

Both columns lay a room out the same way, as a **plan**: *Table form: Long ·
Number of tables: 20 · Seats per table: 10*, with a line underneath saying what
the three add up to. A room is laid out in twenty of the same table, not in
twenty decisions. Both screens used to ask for a line per table with a button
to add another, which meant twenty presses and twenty identical rows to read
back; the list is gone from both, on request. Nought tables is allowed and says
so: the room can be laid out later.

On an event that already exists the plan is **reconciled** rather than applied
from nothing, and that is the whole difficulty of it. A guest is seated by
table number, so a surviving table has to stay the table it was: the
lowest-numbered tables are kept and named by id in what is saved, the surplus
above the count is dropped, and anything new is numbered past the highest ever
used rather than into a gap. Two lines say what saving would do before it is
pressed — which tables would be dropped and how many guests that would unseat,
and, when the tables are not all alike yet, that saving makes every one of them
this size and shape. Cancel puts the stored room back.

Which leaves one thing the plan cannot say: a room of tables that are not all
the same. The three fields start from the commonest shape and the commonest
seat count, and saving makes the rest match. A venue that seats twelve at the
top table and ten everywhere else can no longer describe that here — the price
of three fields instead of twenty rows, and worth naming rather than
discovering.

New events open on **Long**, on request: the venue this was built for lays out
long tables, and typing the same answer into every event is what a default is
for. An event that already has tables starts from the commonest shape among
them instead.

The shape — long, round or square — is descriptive and nothing depends on it:
the spec keeps a floor plan out of scope and tables a numbered list, so nobody
is seated differently for being round. It is on the tables export, which is
the one report a venue reads before the night rather than during it, and it is
deliberately absent from the other two. Tables stored before shapes existed
read back as long, the same default and the same guess: the app never asked,
and nothing turns on the answer.

On the right, the New event form, permanently. It used to be behind a
`+ New event` button that swapped itself for the form; with the form given a
column of its own the button had nothing left to open, so it is gone, and so
is the Cancel beside Create event, which had nothing left to close. Creating
an event clears the form for the next one — by remounting it, which is also
what re-reads the times to start from, so they come from the event just saved.
Nothing ever disables it: there is no ceiling on how many events may be
scheduled.

Manage events comes after the event's own three in the section nav, on
request — Dashboard, Bookings, Expenses, Manage events, and Export/Import
after that. It sat between Bookings and Expenses for a while, which split a
run that reads better whole: those first three are one event as it is worked
through, what it looks like, who is coming, what it costs, and the two after
them are about all of the events rather than any one. It carries no divider
before it either: a rule mid-row read as a break in the sections rather than
as a note about one of them, and it went when the item first moved. Earlier
still it was a button among the event tabs, where it read as a fifth event,
and the screen it opened stood outside the app's chrome — reaching it felt
like leaving. The event rail and
the nav frame it like they frame every other screen, and it shares the loaded
events with them, so an event created or deleted here appears or disappears in
the rail at once.

**Dashboard** — the event's name, then its date and times. The ticket prices
sat between the two and were asked off: they are what the event is sold at
rather than anything about the night, they are on every guest's line on
Bookings where they are actually used, and Manage events is where they are
set and read in full. An event running past midnight is not marked as such
anywhere: 20:00 – 01:30 says it, and the note that used to follow the end
time was asked for off. Nothing there is editable: an event's own details are
set when it is created and changed on Manage events, which is one page owning
the lot rather than three screens each owning a piece of it. Then six figures on one line (guests confirmed and cancelled,
seats available, amount due at the venue, expenses, expected income, expected
profit). Each is a small card read by its heading: the heading is bold at
13px and the number 14px beside it, where the heading was 12px and the number
20px. Both were asked for twice, in that direction — the row is scanned across
for the label you want, not for the biggest number on the screen, and the
height the figures gave up is height the rest of the page moves up by. The
heading stopped at 13px rather than 14 on purpose: at 14 a label like *Amount
due at the venue* takes a third line in a sixth-width card, and the two lines'
room reserved below it stops being the two lines it is there for. Then the
seating list: each table with its seat count, what is free and who is sitting
there, the names a size below the table's own line since a full table is ten
of them on one line. Guests with no name yet are counted rather than
listed. Unseated guests are called out below, because a guest holding no seat
appears in no table's tally.

There was a **Tables** screen between the Dashboard and Bookings. It was cut
down first, on request, to a plain table of two columns — Table Number and
Seats — with a cross on each row, its per-table free-seat line and its party
chips dropped; then removed outright, because at that width it listed what the
dashboard's seating list already gives with the guests' names on it, and
laying an event out had moved to Manage events. Losing it took the nav from
five items to four, where it stayed until Export/Import and then Settings
made six of them.

**Bookings** — a party is a name, a telephone number and a guest count, which
generates that many guest lines. Parties collapse to one line each, and the
list runs two abreast on a wide screen so two of them can be read side by
side. A **+** at the bottom right of each party adds a guest to it. Every
cancellation on the event is gathered under **Cancelled guests** below the
bookings, each one a name with its party in brackets. Guests are
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

A blank line is written where it will end up, in the table's own columns,
rather than in a form above or below it — but only while one is being
written. The row used to sit at the foot of the list permanently, an empty
line on every visit whether or not anything was being added; **Add**, at the
top right where the thing you came to do belongs, brings it now, and saving
or discarding it with the cross takes it away again. Add is disabled while a
blank line is open, because two of them would be two half-written expenses
with no way to tell which Save belonged to which. The column headings come
and go with the table, having been six words above an empty space on an event
with no expenses yet.

**Enter carries on to the next line**, which is how a list of costs is
actually typed: description, amount, Enter, description, amount, Enter. In
the blank line it saves what is there and leaves another blank line behind it
with the cursor already in the description; the Save button is the one that
stops, closing the row. Enter on a line already in the list commits the field
being edited, the way Enter has always done there, and then opens a blank
line below and takes the cursor to it — so a list can be carried on from
anywhere in it without going back up to the button.

The focusing is asked for through state rather than done where the fields are
cleared. Every field is disabled while a save is in flight; at the moment the
fields are emptied, the render that re-enables them has not happened yet, and
focusing a disabled input does nothing at all.

**Export/Import your data** (`/data`) — two columns, the same shape Manage
events has: what goes out on the left, what comes in on the right.

Export asks three things, and the middle one now has three answers. *What* —
current and future events by default,
which is the active ones, since an event stays active until 48 hours after
its date; or all of them, closed ones included; or a tick-list. *Which
format* — JSON, one file, the events exactly as they are held and the only
thing import reads; or CSV, three files, guests and tables and expenses, with
the event's name and date repeated down every row so a row stands on its own.
CSV does not come back in and is not meant to: a spreadsheet is a grid and an
event is not one. Or the **tables and guests** list, which is neither of
those: one file per event, and on it a tick box, the table number, the guest's
name and whether they have paid — the list the door works from on the night.
Paid reads *yes* where the money is in and is deliberately blank where the
guest pays at the venue, so *paid* can be typed beside them as it arrives; a
guest not paying at all reads *no charge*, which tells the door not to ask.
Cancelled guests are off it, unnamed guests are found under their party's
name, and anyone not seated yet is at the end rather than scattered through
the tables.

It writes three ways, the same rows each time. As an **Excel workbook** —
SpreadsheetML content under an `.xls` name, which looks like a contradiction
and is the right way round. As a **web page**, self-contained —
the styling and the script are inside the one file, because it is opened off
the disk where nothing fetched from elsewhere would arrive — with real tick
boxes and real fields, a running *n of m arrived* count, and a print
stylesheet that drops the count, strips the field borders and turns the boxes
back into empty squares for a clipboard. What is ticked and typed there is
kept in that browser's local storage under the event's id and keyed to the
guest rather than to a row number, which would move the moment somebody is
seated; every touch of storage is wrapped in a try, because a page opened
from a file has no origin worth the name in some browsers, and a list that
would not tick because saving failed is worse than one that forgets. Or as
plain CSV.

*Where* — and this is the part with a browser problem inside it.

Chrome and Edge on the desktop can hand a page a handle to a folder, and that
handle can be kept in IndexedDB and used again next time. Firefox, Safari and
every phone cannot: a file goes to downloads and there is no folder to
remember. So the screen offers the folder where it can be offered and says
nothing about it where it cannot, rather than offering a choice it cannot
keep. Where there is a folder, every export asks whether it is still the
right one before writing a thing — *Still saving to Backups?* with **Save
here** and **Choose another folder** beside it. A handle kept from a previous
session comes back valid but unpermitted, so permission is asked for again
inside that press; it has to happen in the click or the browser refuses it.

Import takes a JSON backup, says when it was written and what is in it, and
lists its events with tick boxes — anything already stored is marked *already
here* — so any of it can be left out. Then the one real choice: **add what is
missing**, the default, which leaves everything already stored untouched and
makes running the same file twice a no-op; or **replace everything**, which
empties the store first and names how many events it would delete before it
does. The whole import is one transaction, so a file that fails halfway
leaves the store as it was. Reusable expense lines are merged either way,
even by a restore: they belong to the app rather than to any event, and one
the file does not know about is one this browser learned since.

**Settings** (`/settings`) — a list of closed lines, each reading its own
name and what it is currently set to, opening when asked and one at a time.
Settings are read far more often than they are changed — most visits are to
check what something is, not to make it something else — so the answer is on
the line and the controls are behind it, which was asked for and is also what
keeps a screen of unrelated forms from being a screen of unrelated forms.

*How long a closed event is kept.* An event closes 48 hours after its date
and is deleted a fortnight after that; the fortnight is now a number on this
screen, and it goes down as well as up. It had a floor of fourteen days at
first, taken from the spec's "changeable to a longer period", and the floor
was asked off: how long a finished event is kept is the manager's business,
and a limit the app will not go below is the app deciding it knows better.
Zero is allowed, and says so — at zero a closed event is deleted by the same
sweep that closes it and never appears under Closed at all.

The screen says how many closed events it is holding and how far back they
go, and — this is the part that matters — **shortening the period names the
events it would destroy before it saves**. The sweep runs on the next app
start rather than on Save, so without that warning those events would simply
not be there the next time the app was opened, which is a trapdoor rather
than a setting. The empty field is spelled out as not-a-number rather than
left to `Number`, which reads `""` as `0`: a cleared box would otherwise arm
the most destructive value on the screen and enable Save to go with it.

*Seats a new table starts with.* Ten, until told otherwise. It is what the
tables block on Manage events fills in for you, and it is read once when a
form opens rather than watched, so changing the setting never renumbers seats
in a form somebody is halfway through.

*The currency.* Chosen from a list rather than typed as a symbol, on request,
and the difference is not cosmetic: typing "R" says what character to put in
front of a number and nothing else, while choosing *South African rand* says
which currency the money is in and lets `Intl` decide how it is written —
which symbol, which side of the figure it sits, and what separates the
thousands, all of which vary by currency and by the reader's own locale. What
is stored is an ISO code. None is the default, because the spec names no
currency, and an example of 1 250,50 sits beside the list so the effect can be
seen before it is saved.

Two decimals always, currency or no currency: the store holds hundredths of a
unit whatever the currency is called, and left to itself `Intl` would round a
yen figure to whole yen and show a number that is not the number that was
typed. An unrecognised code falls back to a bare figure rather than throwing,
as does an engine without `narrowSymbol`.

On screen only — the exports keep writing bare numbers, because a symbol in a
spreadsheet cell makes it text and a spreadsheet cannot add up text. That
split is the reason `formatCents` and `formatAmount` are two functions: one is
data, the other display, and only the second learned about currencies. Every
place that shows money goes through a `useMoney()` hook rather than calling
the formatter directly, so choosing a currency changes all twelve of them and
not eleven.

*Delete everything.* Last on the screen, ruled off in red, disabled when there
is nothing to delete, and it names what goes — so many events, so many
bookings, so many guests — before a second press does it. Settings survive it,
the export folder included: that is where the backup was written, and it is
the last thing to take from someone who has just emptied the store.

*Which folder exports go to.* Shown here, and forgettable here, but chosen on
Export/Import: the picker has to open inside the press that exports or the
browser refuses it, so that screen owns the choosing and this one owns only
the undoing. The whole block is absent in a browser that cannot remember a
folder at all.

## Decisions worth remembering

The ones that were argued out and would otherwise be re-litigated:

- **Cancelling a guest removes the line; a + puts one back.** The party
  shrinks by one, the seat is freed for anyone, and the guest appears under
  **Cancelled guests** at the foot of the screen. Their own price is set to
  zero, because nobody is charged for a seat they gave up. Cancelling used to
  open a blank replacement line automatically, which held the party's size
  and its expected income steady but left a nameless row behind after every
  cancellation; that was tried and asked off. Every party instead carries a
  **+** at the bottom right of its guest list, which adds one guest at the
  party's own ticket price — so a substitute is added deliberately, and a
  party that has simply grown can be added to without any cancellation having
  happened. Cancelling a *whole party* leaves its card in the list marked as
  cancelled, with its telephone number still reachable, but with no table of
  guest columns and no **+**: the booking is off, and a live guest on it
  would be an un-cancellation by the side door.
- **A guest added with + sits with their party, or nowhere.** They take a
  free seat at a table the party is already at, tightest first. If the
  party's tables are full they arrive unseated rather than being sent to
  whichever table happens to be emptiest — someone joining a party is joining
  the people, and seating them across the room unasked would be the stranger
  decision.
- **A cancelled guest is a name and a party, and nothing else.** The table
  they held has gone to their replacement and their price is zero, so the
  columns that used to follow them were a row of dashes. The party in
  brackets is what makes the name findable: two guests called the same thing
  are told apart by whose booking they were on.
- **Cancelling is the Cancel button's job only.** The status dropdown offers
  the three live statuses. It used to offer Cancelled too, which is far too
  much to hang on picking a line in a dropdown: it takes the guest out of the
  party, and there is no undoing it.
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
  The strip of tabs already scrolled and already refused to shrink its tabs,
  so it held twelve events as readably as four; down the left-hand side, where
  the events are now, twelve are a list rather than a scroll.
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
  figures, read. Tables now follow the same rule. They were laid out on a
  screen of their own, with three repository calls to add one, resize one and
  remove one; they are laid out on Manage events instead, saved with the rest
  of the row, and those three calls collapsed into `applyTables()` — one
  function, holding the three rules that have to agree with each other: a
  surviving table keeps its number, a new number is never a reused one, and a
  guest at a table that has gone is unseated rather than stranded. It is what
  `createEvent` numbers its tables with too, so there is one rule and not
  two.
- **The page says which colour schemes it handles, so the browser stops
  guessing.** `:root { color-scheme: light dark }` in `globals.css`. Without
  it Chrome and Edge auto-darken a page they think has no dark theme: they
  repaint the light backgrounds dark and leave images alone, which put the
  black-on-white logo on a black bar and made it vanish — while the `dark:`
  swap that would have shown the light-on-dark drawing never fired, because
  nothing had actually asked the page for dark. The app had always had a dark
  theme; it had just never said so. It also hands the native controls their
  theme, which matters here: every date and time field in the app opens a
  picker the browser draws.
- **The door list is a real Excel workbook and no library was added to make
  one.** An `.xlsx` is a zip archive; building one means a zip writer, and the
  spec's own rule is to add no libraries. SpreadsheetML 2003 — Excel's own XML
  — is a single plain-text file with the same abilities this list needs: named
  columns with widths, a bold header, a boxed empty cell to tick, a document
  that opens on a double-click and saves back from Excel. It is written by
  hand into a template string, escaped for the four things XML cares about,
  and deliberately left plain: frozen panes and print setup are each one line
  away and each is a line Excel might call malformed, and a workbook that
  opens with a repair warning is worse than one whose header scrolls off the
  top. The web-page version of the same list is one file for the same reason
  in a different key: opened off the disk, a stylesheet or a script it asked
  for from anywhere else would simply never arrive.
- **The workbook is named `.xls` even though it holds XML, and that is the
  right way round.** `.xml` is what Microsoft's own *XML Spreadsheet 2003*
  writes, so `.xml` is what this wrote first — and on Windows `.xml` is
  registered to the browser. Double-clicking the workbook opened a page full
  of angle brackets instead of Excel, which is the opposite of what choosing
  "Excel" is asking for. `.xls` is registered to Excel and opens there. The
  cost is one dialog: Excel notices the contents are not the old binary
  format the name claims and asks whether to open anyway, and saying yes
  opens the workbook with everything intact. One click, against a file that
  otherwise never reaches Excel at all. A true `.xlsx` would avoid the dialog
  and needs a zip writer — about two hundred lines of one, or the library the
  spec forbids.
- **The logo is imported, not linked, because of the base path.** A project
  page on GitHub Pages is served out of a subdirectory, so every asset URL
  needs that prefix. `next/image` adds it in its loader — but a static export
  needs `images.unoptimized`, which switches the loader off, and
  `src="/event_diary_logo-horizontal.svg"` then goes out unprefixed: perfect
  in `next dev`, a 404 on the deployed site. Importing the file from
  `public/` puts it through the build, which applies the prefix — for both
  the light and the dark drawing. Caught by
  building with `NEXT_PUBLIC_BASE_PATH` set and reading the `src` back out of
  `out/index.html`, which is the only way to see it — every local check
  passes either way.
- **A layout that only wraps does not need `"use client"`.** Three of them —
  Settings, Export/Import and Manage events — carried the directive while
  containing nothing but `<AppScreen>{children}</AppScreen>`: no state, no
  handler, nothing needing a browser. They are Server Components now.
  `AppScreen` is where the client boundary starts, and the page arrives as
  `children`, passed through rather than imported, so it is rendered on its
  own terms and pulls nothing into the layout's module graph. Context still
  reaches the page, because context follows the React tree rather than the
  module graph and the page is still rendered inside the provider.

  Worth measuring rather than assuming: it took **139 bytes** off each of
  those three routes, on a first load of about 619 KB, and **8.5 KB** off the
  total JavaScript written to `out/` — three route modules that no longer
  need chunks of their own. The routes themselves are dominated by the
  framework: of `/settings`'s 619 KB, three React and Next chunks are 496 KB
  of it. So this is the right shape rather than a saving anybody will feel,
  and the reason to keep it is that the next thing added to one of those
  layouts should have to justify crossing the boundary.
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
| Any number of active events, switchable | Done — the spec's cap of 4 was removed on request, and the tabs moved to a rail down the left, both amended in the spec |
| Every event managed in one place | Done — **not in the spec**, added on request |
| Expenses copied forward to a new event | Done |
| Tables: numbered list, seats per table | Done — laid out on Manage events, listed on the dashboard; the Tables screen was cut down and then removed on request, and the spec amended to match |
| Bookings, attendees, per-guest editing | Done |
| Cancel a whole party, or one guest | Done |
| Expenses: line items, reuse, permanent delete | Done, minus one thing below |
| Dashboard | Done, minus the bookings total, removed on request |
| Auto-close 48h after the event date | Done — sweep runs on every app start |
| Retention window, then silent delete | Done — 14 days by default, changeable on Settings |
| Desktop save folder | Done — chosen and re-confirmed on Export/Import, which is where it is used, rather than on a Settings screen; the spec amended to match |
| **Settings screen** | Done — the retention period, the seats a new table starts with, the currency, delete-everything, and the export folder shown and forgettable. The period goes shorter as well as longer, on request, with the spec's floor of two weeks amended away; shortening it names the closed events it would delete before it saves |
| Export All Data | Done as JSON and CSV, with import beside it, and a tables-and-guests door list added on request as an Excel workbook, a web page, or CSV. A real `.xlsx` is a zip archive and would mean a library, which the spec's own dependency rule forbids; SpreadsheetML needs none. Spec amended |
| Ticket prices per event, several with what each includes | Done — **not in the spec**, added on request |
| App header with a logo | Done — the horizontal logo on the left, middle and right kept open; **not in the original spec**, added on request and the spec amended to match |
| Permanently delete a saved expense line | **Gone** — it lived in the Saved lines block, removed on request, and the repository function went with the dead-code sweep |
| Mobile | Done — narrow screens scroll their columns sideways rather than breaking |

Out of scope by the spec and not built: visual floor plan, multi-user, any
network call. Deployment tooling was on that list too until the app was asked
to run from GitHub Pages, and the spec no longer excludes it; see
**Publishing it** above for what that added.

## How it has been checked

There is no test suite in the repository, and two different things have
stood in for one.

**Everything is typechecked, linted and built.** `npx tsc --noEmit`, `npx
eslint .` and `npm run build` are run against every change, and the build is a
real static export of all nine routes rather than a compile.

**The file formats are checked by assertion, against the compiled module.**
`lib/data-transfer.ts` deliberately touches no DOM, so it can be compiled on
its own and driven from Node. 75 assertions in three passes: the backup's
round trip and the five ways a file that is not a backup is refused; the CSV
quoting of commas, quotes and newlines, and a leading `=` neutralised so a
spreadsheet cannot read a party name as a formula; the door list's row order,
its exclusions and the three states of its paid column; the workbook checked
for well-formedness and then parsed again by a real XML parser; and the door
page's own script lifted out of the generated HTML and run in a sandbox
against stub checkboxes, where the count follows the ticks, what is ticked
and typed reaches storage, and a `localStorage` that throws on every call
still leaves the ticking working.

**The screens were checked by driving them in a headless browser** — creating
events, tables and bookings, reading the figures back, and watching the
console. The last such pass was 187 assertions across nine scripted scenarios
(cancellations, guest moves, shared tables, the dashboard figures, expenses,
the saved-line library, carried-over times, event management).

That browser work stopped part-way through. Everything from the tables moving
onto Manage events onwards — the event rail down the left, the app header and
its logo, the whole Export/Import screen, and the three door lists — has been
typechecked, linted, built and, where it is file-format code, asserted over;
none of it has been driven in a browser. So the folder picker, the permission
prompt a remembered folder asks for on a new session, and whether Excel is
happy with the workbook are all unverified here. The log below records the
passes that were done, as they were done: some of them describe screens and a
nav order that have since changed.

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

Cancelling and adding guests have a pass of 32 assertions, which reads the
stored event straight out of IndexedDB as well as the screen: a party with no
cancellations carrying a **+** below its guests at the right-hand edge; the
guest it adds taking the party's last free seat and the party's own ticket
price, and the next one arriving unseated once those tables are full, counted
as unseated on the screen; a cancellation shrinking the party from five
guests to four with no blank line left behind, the guest listed below as
"Bea (Okonkwo)", her seat given back to the free-seats line rather than
passed on, and her stored record cancelled at a price of zero; **+** then
filling the seat she gave up; a second party's **+** seating its guest with
*that* party rather than at the first party's table; a wholly cancelled party
keeping its card, its marking and its telephone number but losing its **+**,
while the live party keeps its own; four cancellations surviving a reload;
and on a phone, a collapsed party showing no **+** and an open one showing a
32px target, with the page not scrolling sideways. The gutter between two
parties was measured at 32px.

`npm run build`, `npx tsc --noEmit` and `npx eslint .` are all clean.

## A note on AGENTS.md

`AGENTS.md` is written and re-added by `next dev` itself. It is not
hand-maintained; committing it alongside other work keeps the tree clean.
