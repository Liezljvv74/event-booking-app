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
  list-keys.ts                   Enter, moving down a list of fields
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

**On a phone the shell is three thin lines rather than two scrolling
strips.** The events become one line naming the one that is showing — *Spring
Gala · 1 of 3* — which opens the rest over the screen when pressed; one event
is a label with nothing to press, and on the screens that belong to no event
it reads *Choose an event*. The section nav keeps the open event's Dashboard,
Bookings and Expenses in the row and moves Manage events, Export/Import and
Settings behind a **More** button, which is itself marked while one of those
three is showing, so the row still says where you are. Everything in both is
a link to the same URL it always was.

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
fields until they are asked for. Beside the pen is a cross, on request, so an
event can be got rid of without opening it first: it asks below the line,
naming the event and how many bookings go with it, and the row stays shut
while it does. The question is written in the same red as the button that
answers it, on request - the question and the answer are one thing, and the
colour is what says at a glance that this line is not an ordinary one. The same question is asked inside the detail when the row is
open, because that is where the eye is in each case. The pen opens the
event's detail below the line it was on: name, date, start and end across, ticket prices beneath, the
event's tables under those, and then Remove event, Cancel and Save. Saving closes the row again, and so does
Cancel and so does the pen, both of which put back what was stored; only a
refused save keeps it open, with the reason showing. Closed events follow
underneath in their own section, collapsed the same way, and appear nowhere
else in the app, so this is the only place one can be looked at or removed
early — they are kept for the retention period set on Settings and then
deleted automatically, and deleting one here is how to be rid of it sooner.
Deleting names what goes with it.

Both columns lay a room out the same way, as a **plan**: *Table form · Number ·
Seats each*, with a line underneath saying what it all adds up to. A room is
laid out in twenty of the same table, not in twenty decisions. Both screens
used to ask for a line per table with a button to add another, which meant
twenty presses and twenty identical rows to read back; the list is gone from
both, on request. Nought tables is allowed and says so: the room can be laid
out later.

Not every room is twenty of one thing, though, so the plan is a **list of
configurations** rather than a single one: twenty long of ten down the hall,
and then four round of eight at the back, is two lines. One line is still the
common case and still costs one line. The tables are made in the order the
lines are written, so the first line takes the low numbers — which means
reordering the lines is a real change to the room rather than a tidy-up, and
is reported as one.

On an event that already exists the plan is **reconciled** rather than applied
from nothing, and that is the whole difficulty of it. A guest is seated by
table number, so a surviving table has to stay the table it was: the
lowest-numbered tables are kept and named by id in what is saved, the surplus
above the count is dropped, and anything new is numbered past the highest ever
used rather than into a gap. Two lines say what saving would do before it is
pressed — which tables would be dropped and how many guests that would unseat,
and, when the tables are not all alike yet, that saving makes every one of them
this size and shape. Cancel puts the stored room back.

An event that already exists is read back into lines the same way it was
written: consecutive runs of the same shape and size become one line each. A
room of ten long, four round and ten long again opens as those three, not as
an average of them — and a room laid out as one thing opens as one line with
Save asleep, because nothing has changed.

Which leaves one thing the plan still cannot say: a single odd table among its
neighbours costs a line of its own. Twelve at the top table and ten everywhere
else is *1 long of 12* and then *19 long of 10*, which is exactly right but
puts the top table first, at number one. That is the price of describing a room
rather than listing it, and it is a much smaller price than it was when the
plan had only one line.

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

The New event form opens **dated a week on** from the event saved most
recently, on request, and on that event's times: a venue's functions run to a
rhythm, and the same weekday next week is the likeliest next one. Today's
date where there is no event to count from.

Under the tables is **Repeat event** — never, daily, weekly, monthly, or on
custom dates, and for the three fixed intervals how many times. Three weekly
repeats makes four events a week apart, which is the sort of thing that has to
be said rather than inferred, so the button reads *Create 4 events* and the
dates are listed above it before it is pressed.

**The form validates itself**, with `noValidate` on the `<form>`. The count
box carries `min`, `max` and `step`, and native constraint validation
cancelled submission before the component's own checks ran: 60 repeats raised
a bubble in the browser's own wording, anchored on an input well above the
button now that the button is at the foot of the form, and said nothing to a
screen reader. Every constraint those attributes express is checked again in
the component with a better message — the count, and the seats and table
counts in the planner's own validator — so taking the browser out of it loses
nothing. The attributes stay for the spinner and the numeric keypad they give
a phone.

A refused press **moves the caret to the field to change**: the name, the
date, or the count. It has to, because the message is often not new — the
summary line reports the plan's problems as they happen, so pressing Create
over one it has already printed adds nothing to the screen, and the press
would otherwise look ignored. The prices and the tables keep their own
editors and their own messages, and nothing on this form holds their inputs,
so those errors move no focus. A custom run over the cap moves none either: a
calendar of 31 days has no one field to blame.

The button **names no number when the plan is broken**. It reads *Create*
rather than *Create event*, because a count of one is the single answer that
looks like an ordinary form, and it used to appear directly under a line
saying no event could be made.

**Create event comes last**, after every answer it acts on — the repeat, the
calendar where there is one, and the dates spelled out. It used to sit at the
head of that row, which put a button labelled *Create 4 events* to the left of
the field that decided there were four. It is at the right of the column on a
desktop, which is the corner a form is finished in, and hard against the left
edge on a phone, which has one edge and nothing to gain from the button
leaving it.

That switch reads the screen's width and not the column's — the only one in
this form that does, since every other breakpoint here is a container query.
Desktop and phone are what the two positions were asked for by, and the
column's width says nothing about either: it is 516px at a 1280px window and
399px on a Pixel 7. Both container breakpoints either side were tried and
each broke one half. The *@sm* one turns at 24rem, under the column on most
large phones, so the button right-aligned over a stacked form on exactly the
screens the left edge was for — and 390px, where it was first checked, sat
10px below the line, which is how it passed. The *@xl* one turns at 36rem,
over the column at 1280, so the button sat hard left on a desktop. The
viewport *sm:* is the 640px the rest of the app already treats as the end of
a phone.

A **monthly** repeat keeps the day of the month, because that is what a monthly
function means to whoever writes it in a diary: the 14th, every month. Where
the month it lands in is too short for that day the last day of that month is
used, so the 31st of January repeats on the 28th of February and then on the
31st of March — never on the 3rd of the month after, which is where the
`Date` constructor's own overflow would put it. Each date is counted from the
original rather than from the last answer, so a run clamped once does not stay
clamped for the rest of the year.

**Custom dates** opens a calendar instead of a count, a month at a time, and
the dates are pressed on it — a season of functions on the nights the hall is
free follows from no interval at all, and a row of date boxes is not pointing
at those nights, it is typing them one at a time with no view of the month
they sit in. Any date may be picked, and one earlier than the event's own
becomes the first of the run, since the run is sorted before it is created.
The event's own date shows as taken and is not pressable there: the Date field
above is the one place an event is dated, and a second way to change it that
disagreed with the first would be worse than no second way at all.

**The picks are forgotten whenever the plan they belong to changes** — the
event's date, or the cadence. They used to survive both. The calendar
re-seeds on the event's date, so moving an event from March to September
painted September while three March picks stayed in the state: off screen,
unpressable without paging back three months, still counted by the button and
still created as events. Leaving Custom dates and coming back restored a list
that had been abandoned. An empty calendar is the only answer the form can
show honestly, and it is where a fresh one starts.

**How it repeats is not remembered.** Every form opens on *Never*, once, with
no dates picked, whatever the last event was scheduled to. It was kept with
the settings for a while, on the reasoning that a venue whose function is
weekly should say so once — but a form that opens on Weekly, 3 times creates
four events for somebody who came to schedule one and pressed the only button
on the form. A repeat is something asked for about the booking in hand, and it
costs one dropdown to ask for it. So there is nothing to save, and nothing
about a run of events outlives the run.

The whole list is handed over in one call rather than one call per event: the
form clears itself once the lot has been saved, and a form that cleared itself
between the third and the fourth would take the rest of the list with it. They are written one at a
time and in order, so each starts from the one before it — which is what
carries the times and the expenses down the run.

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
profit). **Seats available** is the room less every confirmed guest, seated or
not — it used to be the seats nobody was sitting in, summed off the tables,
which counts a guest who has not been given a chair yet as no guest at all. A
room of 30 with 17 confirmed and 5 of them unplaced reported 18 available, and
18 is not a number anybody can act on: take 18 more bookings and 5 people
stand. It reads 13 now, and where the bookings have gone past the room it
reads 0 with the shortfall beside it in red.

The seating list below keeps its own count — *30 seats · 18 unfilled* — because
that is a different question: not how many more can be taken, but where there
is room to put the ones already coming. The two agree exactly when everybody
has a chair.

Each card is read by its heading: the heading is bold at
13px and the number 14px beside it, where the heading was 12px and the number
20px. Both were asked for twice, in that direction — the row is scanned across
for the label you want, not for the biggest number on the screen, and the
height the figures gave up is height the rest of the page moves up by. The
heading stopped at 13px rather than 14 in the row: at 14 a label like *Amount
due at the venue* takes a third line in a sixth-width card, and the two lines'
room reserved below it stops being the two lines it is there for.

**On a phone there is no row**, so neither of those constraints applies and
the cards are shaped for the screen they are on: one card per line, one line
per card, label at the left and figures at the right, the six stacked under
one another. Below the small breakpoint the six were two abreast and three
lines deep each — a heading wrapped over two lines, then its figures below —
which took most of a phone's first screen to say six numbers. Stacked, the
whole set sits above the seating list. The heading goes up to 14px there,
which is the size it wanted all along and could not have while it shared a
row: a label with a line to itself has nothing to wrap against. A block
carrying two figures, *Guests* and a room that is oversold, keeps them side
by side rather than stacked, since stacking them is the one thing that would
make a card two lines. It holds down to 320px with a six-figure amount in
it. Then the
seating list: each table with its seat count, what is free and who is sitting
there, the names a size below the table's own line since a full table is ten
of them on one line. Guests with no name yet are counted rather than
listed. Unseated guests are called out below, because a guest holding no seat
appears in no table's tally — and **Seat them** goes to them rather than to
the bookings screen in general: it carries `unseated=1`, and the bookings
screen opens every party with somebody still to place and brings the first of
them on screen. Opening those parties is a starting position rather than a
rule, so one closed afterwards stays closed and nothing folds up under the
cursor while a guest is being seated. Arriving at bookings any other way opens
nothing, as before.

There was a **Tables** screen between the Dashboard and Bookings. It was cut
down first, on request, to a plain table of two columns — Table Number and
Seats — with a cross on each row, its per-table free-seat line and its party
chips dropped; then removed outright, because at that width it listed what the
dashboard's seating list already gives with the guests' names on it, and
laying an event out had moved to Manage events. Losing it took the nav from
five items to four, where it stayed until Export/Import and then Settings
made six of them.

**Cancelling is a cross** on both counts, on request. On a guest's own row —
one of these sits on every guest of every party, and the word said the same
thing a dozen times down a column — and on the party's line beside Edit. The
guest's cross names the guest rather than their position, which is what a
cross has instead of a face: "Cancel Ann Jones", falling back to "Cancel guest
2" for someone not named yet.

The red button that answers *Cancel all 3?* keeps its words. A cross beside
*Keep* is read as "never mind" by half the people who press it, and
un-cancelling is not possible: a party cancelled by a misread cross does not
come back.

A party with anybody still to place is **tinted amber**, border and all, on
request: the same colour the dashboard's unseated line and the too-many-guests
warning already use for something wanting attention that is not yet wrong. The
whole card rather than a badge on it, because the point of a colour is to be
findable while scrolling past thirty parties and a badge has to be read to be
noticed. A wholly cancelled party is left grey — nobody in it has a seat, and
nobody in it is coming either. Seating the last guest takes the colour off.

Each guest's row carries a **Regular** tick between their name and their
table, on request: somebody who comes to everything. A guest ticked there is
written into the next event as it is created, at the same table, and arrives
still ticked so it happens again rather than once.

They arrive as one party called **Regular** — not as the family booking they
happened to be sitting in, which is somebody else's party. It can be renamed
like any other party, and the new name carries on from then, because the event
after that finds its regulars already gathered in a party whose every guest is
one and keeps that party's name. That is the whole rule: a name travels only
from a party that is entirely regulars.

The party is given a telephone number — the first regular's own, or the number
of the party they came from. Not tidiness: a booking cannot be saved without
one, so a party carried over with the field blank could never have been
renamed at all, which is the one thing this feature had to allow.

They come from a **standing list**, kept with the settings and read on
**Settings > Regulars**, which is where they are pruned. Taking somebody off
there is the only thing that stops them being added to new events, and it
unticks them wherever they are ticked, so the two can never disagree.

That list is the second design, and the first is worth recording because it
failed in two ways. It kept the mark only on a guest's row and worked out who
the regulars were by looking at whichever event was written most recently.
That made the answer depend on the order events happened to be created in:
tick two on a February function, create a March one from a blank form, and
the most recent event has none, so nobody comes through. And it would have
lost the lot the day that event was deleted or swept away by the retention
period, which for a venue running monthly functions is a real prospect, since
the previous event can be purged before the next is made. A list of its own is
answerable at any time and survives every event being deleted.

They are seated at **the same table number, always**, so long as the new room
has that table — they are placed before anybody else, into an empty room, so
nothing else can have taken the chair. A room laid out without that table
leaves them unseated, which is the one case the guarantee cannot cover: there
is no table to put them at, and inventing one nobody asked for would be
worse. They still come, and their party is tinted amber until they are
placed.

What does not travel: whether they had paid (it is a different event, so
everybody arrives due to pay at the venue) and their old ticket price (they
start on the cheapest of the new event's, where any new guest starts).

**Bookings** — a party is a name, a telephone number and a guest count, which
generates that many guest lines. Parties collapse to one line each, and the
list runs two abreast on a wide screen so two of them can be read side by
side. The party name opens and closes its guests; **Edit** opens both halves
at once — the party's own name and telephone, and the guest list under them.
Edit used to open the name and number alone, which left the guests a second
press away on a different control: a party rung to change the booking is
usually changing who is in it, so one press now puts the whole party in
front of you. It opens the guests rather than toggling them, so Edit on a
party already open is not the press that shuts it, and they stay open when
the party's own fields are saved or cancelled — closing a list somebody is
working in is a change nobody asked for. The party name closes them again,
and while the fields are up it is the one thing off screen, so the guests
cannot be folded away mid-edit either. A **+** at the bottom right of each
party adds a guest to it. Every
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

A guest is a row of columns where the party is wide enough to hold them and
**one compact line** where it is not. The columns need 594px, and **the party
card measures itself** — a container query at 38rem of its own width, not a
`sm:` breakpoint against the window.

The compact line is the name, the status as a word beneath it, the table as a
dropdown, a **pencil** and a cross, under one heading row per party reading
*Guest* and *Table*. **Three things can be done from it and no more**: change
the table, cancel that one guest, or open the full detail.

The pencil is the same button an expense line carries, in the same place and
the same 40 by 44 — both passes assert those dimensions, so the two compact
lists are provably the same shape and not merely meant to be. Tapping the name
or the rest of the line opens the detail too; that is a guest line's own
affordance, and an expense line cannot have it because every part of one is a
control. A visible button is the half of it that can be found without being
told.

The headings are a row for the party rather than a label above every dropdown,
because a label per guest costs a line of height on each of them — the room
the compact line exists to save. Only two of the three cells are named: a name
reads as a name and *Paid* reads as a status, but a bare number beside a red
cross does not read as a table until something says so.
Everything else is behind that tap. It replaced a stacked card of six controls
per guest, which meant a party of ten was a very long scroll of dropdowns with
the two facts worth scanning for — who, and have they paid — spread down it;
ten guests are now ten lines of 56px.

**The detail opens over the screen** and holds every field: name, status,
table, ticket price, the Regular tick and **Cancel guest** below a red rule.
It is the same arrangement the columns hold, stacked, and not a second copy of
it — see the note in *Decisions worth remembering*. Fields commit as they are
left, exactly as in the table, so **Done** only closes the panel; Escape, the
cross and a press outside do the same, and cancelling the guest from inside
closes it because there is no guest left to show. Closing puts the cursor back
on the line it came from.

**The batch-move ticks stay with the table.** Picking several guests to travel
together needs room to show what was picked, so the compact line has no tick
and the party header has no *Select all* beside it. Cancelling a whole party is
still the cross in the party header, in both layouts.

The list runs **two parties abreast from 1536px**, where each half has 622px
and the columns fit. It used to split at 1280px on the strength of a comment
claiming half an `xl` screen cleared what the columns need; it did not — half
of 1280 leaves a party 494px — so the last columns were hidden behind a
sideways scroll at the three commonest laptop widths there are. A party is
also capped at 54rem, so a single one below the split does not stretch its
name field across a 1440px window.

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
edited in place where the list is wide enough for the columns, and a **vertical
group of labelled fields** where it is not. The columns need 624px and **the
list measures itself**, a container query at 40rem of its own width, the way a
party measures itself on Bookings: the list is the window less the event rail
and the page padding, about 224px, so a tablet that `sm:` called wide gave the
six columns 416 to 544px and hid the last of them behind a sideways scroll.
Narrow, it is **one compact line**: the description, the amount, the paid tick,
a pencil for the two fields the line does not carry, and a cross. Four things
can be done from it — retype or re-pick the description, retype the amount,
tick it paid, clear it — and the pencil opens **provider and notes** over the
screen. A pencil rather than a star, which reads as a favourite; whether
anything is written in those two fields is said by the button's border and ink
instead.

The notes are **one editable block**, because an expense carries a single
`notes` value: the panel is a taller box for the same string, never a new box
per note. Both fields commit as they are left, as they do in the table, so
**Done** only closes the panel.

The narrow header carries **the total and what is still to pay**, and the total
row at the foot goes with the columns, so no figure is printed twice on one
short screen. **Add** becomes a **+**; **Clear all lines** keeps its words. A
heading row names the compact columns once for the list. That last one is grey rather than red, unlike cancelling a guest —
the line goes to the saved lines and can be picked back out, so it is not the
one-way door a cancellation is. The blank line being written follows the same
shape, and the running total, which sits under the amount column in the
table, spreads across one line of its own on a phone. Only description and amount are required. Clearing a line
saves it to a library that every Description dropdown then offers, minus
whatever is already in the list. The button that clears one is a cross, on
request, as is the one that clears the guests picked for a move on Bookings:
a button in a column of twenty identical buttons does not need to spell
itself out, and the word has gone to the tooltip and the accessible name
rather than disappeared. **Clear all lines** keeps its words — it is one
button rather than a column of them, and a cross where an unlabelled press
would empty the screen is not a saving.

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

**Enter goes down the column**, which is how a list is actually typed: every
description, then every amount, rather than every field of one line and then
every field of the next. It commits the field it leaves and moves to the same
field on the line below; at the bottom of the list it makes the next line and
goes to that. In the blank line it saves what is there and leaves another
blank line behind it with the cursor in the description, and the Save button
is the one that stops, closing the row.

That focusing is asked for through state rather than done where the fields are
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

*How long a closed event is kept.* An event closes 48 hours after its
scheduled date
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

*How a new event repeats* is deliberately **not** stored, here or anywhere,
and so has no line on this screen either — it is named here only because it
had one of these paragraphs while it was a setting. It is asked on the New
event form and forgotten with the form: unlike the seat count, it is not a
standing fact about the venue but a request about one booking, and one that
creates events by itself if it is remembered wrongly.

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
is nothing to delete. Its wording is the manager's own — *"This will delete
every event and all expense lines. There is no undo. It is suggested that you
use Export/Import to create a backup in case you need to restore the data
later."* — with Export/Import left as a link inside it, since a suggestion
worth making is worth being one press. It names what goes — so many events, so many
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

  Three more went the same way once the phone layouts made the cost of them
  visible: the four lines above the Expenses list saying which fields are
  required and what each Description offers; the two above the New booking
  form saying that the guest count generates that many guests and that they
  are editable afterwards; and the two under the **Closed** heading on Manage
  events saying that closed events are kept for the retention period and can
  be deleted early. Each was true, each narrated what the fields it sat above
  already do, and on a phone each cost a screenful of the list it was
  introducing. All three facts are in this file — the first two were already
  — and the paragraph above is the standing test: a thing a user is told once
  on meeting the app is not a thing to print every time they use it.

  What stayed is everything that is not narration: the blockers with a way
  out of them (*no tables yet, so guests cannot be seated*, with its link to
  Manage events), the warnings (*more guests booked than seats exist*), the
  notice saying where a party just went, the IndexedDB failure, and the
  empty-state lines, which only appear when the screen would otherwise be
  blank and answer the question that blankness raises.
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
  it, and on Bookings that was the 594px the guest columns need — so the page
  itself began scrolling sideways on a phone instead of the guest rows doing
  it, which is the one thing the spec's mobile rule forbids. It cost nothing
  to fix and would have been easy to ship. The guest rows no longer overflow
  at all, since the party card only draws them when it has room, but the rule
  stands for whatever is put in that column next.
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
- **Which line is below which is a question the document already answers.**
  Enter moving down a list is done by reading the DOM — three attributes,
  `data-list` on what holds the rows, `data-list-row` on each row and
  `data-list-field` on each field naming its column — rather than by keeping
  a model of the list in React state. A second answer to a question the
  document answers is a second answer that can disagree, and it would, the
  first time a row was filtered, sorted or removed. The handler sits on the
  row rather than on each field, so every field is covered — the selects and
  the tick as well as the text boxes — and a field's own handler gets on with
  saving what was typed without also having to know where the cursor goes.

  A column is one column whichever control is standing in it. The ticket
  column shows a dropdown of the event's prices, or a box to type an amount
  into, depending on the guest — and while those two carried different column
  names, Enter from the typed box looked for a box the row below has not got,
  found nothing below it, and added a guest instead of moving down. Reading
  the code did not catch that; the first pass in a real browser did.

  Tab needed nothing: it already moves to the next field to the right, because
  it follows the order the fields are written in. Nothing anywhere in the app
  reorders itself visually with `order-*` or a reversed flex direction, which
  is the one thing that would put Tab out of step with the eye — so the right
  amount of code for Tab was none.
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
- **One order of fields serves both layouts, and `display: contents` is what
  lets it.** A guest wants its name and payment status first on a phone card,
  and the columns had the status fourth. The fix is not `order-*` on the
  phone. The rule written into `components/list-keys.ts` is that nothing
  reorders itself visually away from the order its fields are written in,
  because that is the one thing that puts Tab — and a screen reader — out of
  step with the eye. So the markup moved instead. The
  status went up beside the name, the Regular tick went down beside the
  cross, and the grid's columns were re-sequenced to match, which is why the
  desktop headings now read *Name · Status · Table · Ticket · Regular*.

  The card's lines are wrapper divs that are `sm:contents`: on a phone they
  are a flex row or a two-column grid, and from `sm` up they dissolve and hand
  their fields straight to the one grid as its columns. So there is one copy
  of every control, one set of `data-` hooks, and no chance of the two
  layouts drifting apart — which is what rendering a phone version beside a
  desktop version would have risked.
- **A colour that differs by width is stated as a `max-sm:`/`sm:` pair, never
  as a bare utility plus an override.** The guest's cancel is red on the card
  and grey in the row. Written as `border-red-300` with `sm:border-zinc-300`
  over it, the two overlap in light mode at one variant of depth apart and the
  winner is whichever Tailwind happened to emit last — the same trap that let
  the orange lose to the black once already. Written as `max-sm:border-red-300`
  and `sm:border-zinc-300`, the two media queries cannot both apply, and the
  `dark:` forms of each sit one depth above their own light form exactly as
  everywhere else in the app. Both were read back out of `getComputedStyle` at
  both widths in both themes rather than trusted.
- **A table that can be narrow on a wide screen asks its container, not the
  window.** The guest columns need 594px and were switched on at `sm`, which
  is a question about the screen. It is the wrong question. Measuring across
  twelve widths found two separate bands where a party had less than 594px and
  clipped its last columns: 640 to about 830px, where the list is one column
  on a tablet and a party had 398 to 526px, and 1280px up, where the list ran
  two abreast and each party had 494 to 574px. No viewport breakpoint can tell
  either band apart from the 900px screen where the same one-column layout has
  658px and fits.

  So the party card declares `@container/guests` and the guest row asks
  `@min-[38rem]/guests:`. The expense lines have the same shape of problem in
  the lower band alone — six columns needing 624px in a list that a tablet
  gives 416 to 544 — and the same answer, `@container/lines` at 40rem, named
  apart because the threshold differs. Between them they took the last two
  `min-w-[…]` props off these screens: a table that is only drawn where it fits
  has no need of a floor to scroll against. The two-abreast split moved from `xl` to `2xl` as
  well, because 1280 to 1440 is where most laptops live and a table is the
  better thing to show there; between them, the split decides how many parties
  fit abreast and the card decides what it can draw in the width it is given.
  Capping a party at 54rem is the third part: without it a single party below
  the split stretched its `1fr` name column to 640px, with the cross that
  cancels a guest at the far end of the window.
- **Enter must step to a field that is on the screen.** A row can hold the
  same column twice now — the expense lines carry a compact field for a narrow
  list and a table cell for a wide one, and CSS decides which is shown.
  `stepDown()` used `querySelector`, which hands back whichever comes first in
  the markup either way, so half the time Enter focused a `display: none`
  field. Focusing a hidden input does nothing at all: no error, no move, the
  cursor simply stays put and the key looks broken. It now takes the first
  candidate with client rects.
- **A modal cannot live inside a container query.** `container-type:
  inline-size` gives an element layout containment, which makes it a
  containing block for `position: fixed` descendants — so the guest detail,
  rendered inside the party card that declares `@container/guests`, would be
  pinned to a card 340px wide instead of to the window. It is portalled to
  `<body>` instead.

  Which raises the opposite problem: outside the container, none of the
  `@max-[38rem]/guests:` classes match, so the fields would arrive with no
  layout at all. The panel therefore declares `@container/guests` itself, at
  26rem — below the threshold — and the very same `GuestFields` component
  lays itself out in the stacked shape without a single class written twice.
  The fields follow the width of whatever they are in, wherever that is.
- **Width is not part of a field's shape.** `FIELD_SHAPE` used to include
  `w-full`, which every caller wanted until one did not: the table dropdown on
  a compact line is 5.5rem, and `w-[5.5rem]` beside an unprefixed `w-full` is
  two utilities for one property with the winner left to whichever Tailwind
  emitted last. It emitted `w-full`; the field came out 346px wide and pushed
  the cross off the edge of the page. The browser pass caught it as 46px of
  sideways scroll, which is the only reason it was found — it looked right in
  every other respect. Width now belongs to whoever knows how wide the field
  should be.
- **A Tailwind class assembled from a constant does not exist.** The obvious
  way to write the above is `const GRID_AT = "@min-[38rem]/guests"` and then
  `` `${GRID_AT}:grid` ``. Tailwind reads the *source text* for the class names
  it should generate CSS for, so a name built at run time is a name it never
  sees: the markup looks right, the class is on the element, and no rule
  exists. It fails silently, which is the worst way for it to fail. Every one
  of these variants is written out in full, and the build was checked for
  `@container guests (min-width:38rem)` in the emitted CSS rather than assumed.
- **`overflow-x: auto` takes `overflow-y` with it, and that ate a menu.** The
  phone's More menu hangs below its row from `top-full`. The row carried
  `overflow-x-auto` — left over from when six items had to scroll — and CSS
  promotes an `overflow-y` of `visible` to `auto` the moment the other axis is
  set, so the row was a scroll container in both directions and clipped the
  menu away entirely. The panel had a bounding box, a client rect and
  `aria-expanded="true"`; it painted nothing but a stray vertical scrollbar at
  the end of the row.

  Two things came out of it. The menu now hangs off the `<nav>`, which is not
  a scroller, rather than off the row inside it. And the browser passes are
  no longer allowed to conclude "it is open" from a box: `__onScreen()` takes
  the middle of a panel and asks `elementFromPoint` what is actually there,
  which is the only check that can tell a panel from the memory of one. Every
  assertion about this menu had passed while it was invisible.
- **A panel's visibility is a class, not just the `hidden` attribute.** Both
  phone panels carry `hidden={!open}` and a conditional `flex`/`hidden` class.
  The attribute alone is not safe here: its `display: none` comes from the
  browser's own stylesheet, and any author `display` utility outranks it — so
  a panel written `flex` unconditionally is a panel `hidden` cannot close.
- **The page scrolling sideways on a phone was the section nav all along.**
  It took three goes to pin down, which is worth recording because two of the
  three were plausible and wrong. The overflowing elements a sweep reports are
  mostly false positives: a link inside a scroller genuinely sticks out of its
  box without extending the page. Blaming the dev overlay was wrong too — the
  deployed site did it as well, once it had an event on it to draw a nav for.
  What settled it was hiding one subtree at a time and watching
  `documentElement.scrollWidth` come back: 533px to 375px the moment the
  section row went. Six items in a 390px row were the whole of it, and moving
  three of them into the menu is what fixed the page as well as the row.
- **A freed seat needs somewhere to be filled from.** A cancelled guest has
  always given their seat back: `tableOccupancy()` counts only the statuses
  that occupy one, so the free-seat line, the dashboard, every table dropdown
  and the move bar all stopped counting them the moment they were cancelled.
  What was missing was the other half. A party whose every guest had been
  cancelled showed no **+**, on the reasoning that a live guest on a cancelled
  booking would be an un-cancellation by the side door — so the room reported
  four free seats at table 1 and the party those seats came back from had no
  way to put anyone in them. The only route was a whole New booking, which is
  not an obvious thing to reach for when a party is sitting there with a table
  free beside it.

  Adding a guest un-cancels nobody: the guests who dropped out stay cancelled
  and stay in Cancelled guests, and the new one is a new person on a booking
  that stands again. So the + is unconditional now, and `addAttendee()` seats a
  guest joining a party that sits nowhere the way a new booking is seated —
  the tightest table with room — rather than leaving them nowhere, which would
  have read as the app refusing to give back a seat it had already freed. A
  party with live guests who merely have no table is still left alone: that is
  one being placed by hand.
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
| Mobile | Done — the two dense tables become stacked cards below `sm`, and the chrome is one compact event line plus one section row with the app screens behind **More**. Nothing on a phone scrolls sideways any more: the page itself does not, and neither do the navigation rows that used to |

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

That browser work stopped for a stretch — the event rail, the app header and
its logo, the Export/Import screen and the door lists were all typechecked,
linted, built and asserted over, but never driven — and it has started again,
because a bug report about the keyboard could not be settled by reading the
code. Chrome is launched headless with its own `--user-data-dir`, spoken to
over the DevTools Protocol through the `WebSocket` Node has built in, and
stopped afterwards by its own process id. Never by image name: that would
close every Chrome window on the machine, which is a mistake this project has
made before.

Eleven assertions over Enter, against the running app: it moves down each of
the four guest columns without adding anything, moves down from a typed
ticket amount, adds a guest at the foot of a party and lands the cursor on
it, adds to the right party when two are open, moves down the expense lines,
and opens the blank expense line from the last of them. That pass found a
fault reading the code had not: see the note on the ticket column below.

The stacked phone layouts have a pass of their own, **68 assertions run twice
— once in a light-mode browser and once in a dark-mode one, 136 in all**, with
the same event, party of three and two expense lines driven through the
buttons at 390px and then re-measured at 1280px.

At 390px: each guest and each expense line is a bordered card with
thumb-sized fields; the fields stack in the order they are written, with the
name and status above the table and ticket, the Regular tick after them and
the cancel last; table and ticket share a line and the table is the left of
the two; every field carries its own name and the column headings are gone;
the party tick reads *Select all*; the cancel sits below a red rule, says
*Cancel guest*, spans the card and resolves to a red border rather than a
grey one; the expense clear says *Clear line* and resolves to grey; the paid
tick's middle lines up with the middles of the boxes beside it; and the total
and what is outstanding share one line.

At 1280px: the card melts back into the grid — the wrapper divs report
`display: contents` and paint no box, so the red rule cannot show; all seven
guest fields and all six expense fields sit on one line each; the columns run
in the written order and the headings stand over the fields they name; the
card's own field names are gone; both crosses are 36 by 36 and grey; and the
running total's right edge still lines up with the amount column's.

**The compact expense line has a pass of its own: 42 assertions, in both
themes, 84 in all.** At 390px: two lines of 54px; the description typeable and
still carrying its dropdown of lines used before; the amount and the paid tick
on the line; the pencil and the cross; and none of the six inline fields a
control there. The heading row names the columns and *Amount* stands within a
pixel of the field it names. The header reads `Total 7,700.00 · 3,200.00
outstanding`, the long reckoning and the foot total are gone, Add measures 40px
and reads `+`, and Clear all lines stays.

Then the arithmetic, driven rather than read: retyping an amount to 4,800.00
moves the header total to 8,000.00, and unticking paid moves what is
outstanding to 8,000.00 as well. The panel opens from the pencil, is confirmed
a child of `<body>` and confirmed painted, and holds the provider and the
existing note as a single `<textarea>` — one block, counted, not one per note.
Adding a second line to that note leaves one block holding both, Done closes
it, and reopening shows the note came back from the store rather than having
been held on screen. The cross clears that line alone. At 1280px all six fields
are back on the row with the long reckoning, the foot total and the word *Add*.

Enter was checked at both widths, since the whole arrangement turns on the
markup order it reads: it still steps down the name column in the table, and
the compact line is confirmed to hold no typed field for it to walk — there is
nothing to type on that line, which is the point of it.

**The compact line and the detail behind it have a pass of their own: 47
assertions, run in both themes, 94 in all.** At 390px: a guest is one line of
56px rather than a card; it shows the name and the status as a word; the table
dropdown reads the table the guest is at and offers the free ones; the cross is
there; and none of the other seven controls is on the line. Select all and the
column headings are gone with the ticks they belonged to.

Then the behaviour, driven: tapping the line opens the detail, which is
confirmed to be a child of `<body>` and confirmed painted with
`elementFromPoint` rather than by its box; every field is in it, the
batch-move tick is not, and the fields measure 44px, which is the stacked
shape. Changing the status inside it reaches the line behind it — *Paid* to
*Not paying* — and the panel stays open while more is edited. Done closes it
and returns the cursor to the line; Escape closes it; the body can scroll
again afterwards. The table dropdown on the line moves the guest to table 2,
and the cross takes one guest of three off the party and puts them under
Cancelled guests. At 1280px all seven controls are back on the row, Select all
and the headings with them, and there is no second table field beside them.

That pass ran two assertions short at first: on a phone the page itself
scrolled sideways by about 150px, from outside the cards. It was the section
nav, and simplifying the navigation fixed it — those two assertions pass now,
and the pass is 70 for 70.

Both tables being clipped is fixed too, and they share a pass: **72 assertions
across twelve widths** — 640, 700, 768, 900, 1024, 1100, 1280, 1366, 1440,
1536, 1680 and 1920px — checking for each of the guest columns and the expense
columns that nothing is hidden behind a sideways scroll, that the page itself
does not scroll sideways, and that the layout is the stacked one below its
threshold and the table above it (about 830px of window for a party, about
864px for the expense list). The same sweep before the change is what found
the bands of clipping in the first place, and it still prints the room each
layout has against what its columns want, so the next change to either can be
measured rather than guessed at.

**The phone's navigation has a pass of its own: 40 assertions, run in both
themes, 80 in all.** Three events are created and then read at 390px and at
1280px. On a phone: the scrolling strip of events is gone and one selector
stands in its place, naming the open event and its position; the section row
holds Dashboard, Bookings and Expenses and nothing else; Manage events,
Export/Import and Settings are behind More, in full words; the row has nothing
left to scroll sideways and neither has the page; both controls keep 8px clear
of the right edge; and the whole chrome measures 154px from the top of the
page to the bottom of the nav. On a desktop all six items are back in one row,
with no More button, no selector, and the rail listing all three events.

The behaviour is driven rather than inspected. More starts closed and opens
when pressed; Escape closes it and so does a press outside it; choosing
Settings navigates to `/settings/`, closes the menu behind it and leaves More
marked. The selector lists all three events, marks the open one, and every
option is a real link carrying `?id=`; choosing another lands on that event's
dashboard at a different URL, and the back button returns to the screen it
came from. Both panels are checked with `elementFromPoint` rather than by
their boxes, which is what caught the clipping described above. With no event
created at all, the three app screens are the whole row and there is no More
button to hide them behind.

**Freed seats have a pass of their own: 29 assertions across two scripts**, on
a room deliberately too small to hide anything — one table of two seats in the
first, two tables of two in the second, so a single seat is the difference
between a party fitting and not.

The first walks the whole cycle: two guests fill the only table and it reads
full; one is cancelled and the free-seat line says `table 1: 1`; **+** puts a
guest in that seat; the whole party is cancelled and both seats come back; the
wholly cancelled party still offers **+** and the guest it adds lands at the
freed table rather than nowhere; and a brand new party of two seats itself
there with no complaint about room.

The second takes the paths a single table cannot reach. With both tables full,
one guest is cancelled off party A and a guest of party B is moved onto that
seat with their own dropdown — the option reads `1 · 1 free` and is not
disabled, and the move is accepted with no error. Another cancellation, and the
batch move bar offers `Table 1 · 2 free`. Then, at 390px, a guest is cancelled
from inside the detail panel: the panel closes itself, the party is one guest
shorter, and the seat is back in the free-seat line.

Between them they cover every route a seat can be claimed by: the per-guest
dropdown, the move bar, **+**, a new booking's auto-seating, a whole-party
cancellation and the mobile panel.

Still unverified: the folder picker, the permission prompt a remembered folder
asks for on a new session, and whether Excel is happy with the workbook — all
three need a person to answer a dialog. The log below records the older
passes as they were done: some describe screens and a nav order that have
since changed.

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
