# Event Booking & Table Manager — Build Spec

## What this is
A local web app that replaces a physical diary for managing event bookings,
table placements, attendee payment status, and expenses. Used by a single
event manager for now. (The app may evolve into a bigger app, with more functionality to cater to more than one event manager.  This is not currently part of the spec)

## Tech stack
- This is a Next.js project

## Non-negotiable rules
1. The app runs locally via `npm run dev` and is checked at `localhost:3002`.
2. The app is published as a **static export** to GitHub Pages: `npm run
   build` writes plain HTML, CSS and JavaScript to `out/`, and one GitHub
   Actions workflow puts it online. Nothing runs on a server — the site is
   files, and every event still lives in the browser that opened it.
3. There is **no backend** and **no user accounts** — no server process, no
   auth, no login screens.
4. All data persists in the browser via IndexedDB. Nothing may be lost on
   refresh, close, or reopen.
5. Must run faultlessly on mobile browsers as well as desktop. Any
   desktop-only feature must degrade gracefully on
   mobile, never break the app.
6. Do not add libraries beyond what's needed for this spec. Keep the
   dependency list minimal.

## Data model
- **Event**: id, name, event date, list of tables, list of bookings, list
  of expenses
- **Table**: id, table number, seat count (default 10), shape (long, round
  or square; default long)
- **Booking**: id, party name, list of attendees, telephone manditory
- **Attendee**: id, name, assigned table Number (nullable), status, telephone
  optional, regular (a guest who comes to everything)
  (`paid` | `pay_at_venue` | `not_paying` | `cancelled`), ticket price
- **Expense**: id, description, amount

## Core features

### App header
- **The section nav is one row.** From a tablet up it carries all six
  screens: the open event's Dashboard, Bookings and Expenses, then Manage
  events, Export/Import and Settings. On a phone it carries the event's three
  and puts the other three behind a **More** button, which is marked while one
  of its own screens is showing. Every item is a link to a real URL at either
  size — nothing navigates by handler — so bookmarks, reloads and the back
  button work throughout. With no active event the three app screens are the
  whole row, at every width and with no More button, since Manage events is
  then the only way back.
- A bar across the top of every page, in three sections: the Event Diary logo
  on the left, and a middle and a right kept open for whatever they are later
  given.
- The logo is drawn twice, dark on light and light on dark, and the theme
  picks one. No plate behind it in either.
- Present on every screen, the entry and loading screens included, so it does
  not appear and disappear as a screen loads.

### Events
- Any number of active events at a time, listed down the left-hand side of
  the page and switched by picking one. Each shows its name and its date
  only; an event's times are read off the dashboard heading.
- **On a phone that list is one line**, naming the event whose screen is
  showing and where it sits in the list, and opening the others over the
  screen when pressed. One event is a label with nothing to press. The rail
  and the line are both lists of links to the events' own URLs, so an event
  can be bookmarked and the back button moves between them.
- Each event has its own tables, bookings and expenses
- "New Event" duplicates the previous event's expense list as a starting
  point (still editable/removable)
- A new event opens dated a week after the event saved most recently, and on
  that event's times — a venue's functions run to a rhythm, and the same
  weekday next week is the likeliest next one. Today's date where there is no
  event to count from.
- **Repeat event**, under the tables: how often it repeats — never, daily,
  weekly, monthly, or on custom dates — and, for the three fixed intervals,
  how many times. Three weekly repeats makes four events a week apart, and the
  dates are listed before the button is pressed rather than left to be
  counted.
- **Create event is the last thing in the section**, after the repeat, the
  calendar where there is one, and the dates it makes — so in Custom dates a
  whole month sits between the dropdown and the button. At the bottom right
  on a desktop; hard against the left edge on a phone.
- A monthly repeat keeps the day of the month, since that is what a monthly
  function means to whoever writes it in a diary. Where the month it lands in
  is too short for that day, the last day of that month is used: the 31st of
  January repeats on the 28th of February and then on the 31st of March.
- **Custom dates** opens a calendar, a month at a time, and the dates are
  pressed on it. Any date may be picked, and one earlier than the event's own
  simply becomes the first of the run. The picks are forgotten if the event's
  date or the cadence changes: they belong to the plan they were made
  against, and the calendar cannot show a pick in a month it has left. The event's own date is in the run and
  is not pressable there — the Date field is the one place an event is dated,
  and a second way to change it that disagreed with the first would be worse
  than no second way at all.
- **How it repeats is not remembered**: every form opens on Never, once, with
  no dates picked. A repeat is a request about the booking in hand, not a
  standing fact about the venue, and a form that opened on the last event's
  rhythm would create a run of events for somebody who came to schedule one.

### Tables
- Simple numbered list, no visual floor plan yet.  
- Default 10 seats per table; editable per table, per event
- A room is laid out as a plan, never as a list: table form, number of tables,
  seats per table. Twenty of the same table is three fields, not twenty rows.
  Nought tables is allowed and means the room is not laid out yet.
- A venue with more than one kind of table says so on more than one line: add
  another configuration for the round tables at the back, or for the bigger
  ones at the front. The tables are made in the order the lines are written,
  so line one takes the low numbers.
- The same three fields on the New event form and on the event's own row on
  Manage events, which is the only place an event is laid out.
- On an event that already exists the plan is reconciled rather than applied
  from nothing. The lowest-numbered tables are kept — a guest is seated by
  table number, so a surviving table has to stay the table it was — the
  surplus above the count is dropped and whoever sat there is unseated, and
  anything new is numbered past the highest ever used. What saving would drop,
  and how many guests it would unseat, is said before it is saved.
- The shape is descriptive: nothing seats anybody differently for being round.
  It is on the tables export so the venue knows what to carry in.
- No Tables screen of its own. The dashboard's seating list is where the
  tables are read: each with its seats, what is free and who is at it.
- Removing a table unseats whoever was at it; they return to the unseated
  pool rather than being cancelled.

### Bookings & attendees
- Creating a booking = party name + guest count → generates that many
  attendee records
- **Edit on a party opens the party and its guest list together** — its name
  and telephone, and every guest under them — since editing a booking is
  usually editing who is in it. The guests are opened, never toggled, so Edit
  on an open party leaves it open, and they stay open when the party's own
  fields are saved or cancelled. The party name is what closes them again.
- Each attendee: name, table assignment, status, ticket price (defaults
  from the booking's price but is editable per attendee)
- **Cancel whole booking**: sets all attendees in the party to `cancelled`,
  frees their seats
- **Cancel part of a booking**: cancel individual attendees within a party
  without touching the rest
- **A cancelled guest gives their seat straight back to the room**, and the
  party they were cancelled off can put somebody in it. Its **+** is there
  whether or not any guest on it is still coming: adding a guest un-cancels
  nobody — those who dropped out stay cancelled and stay in Cancelled guests —
  and a party whose every guest was cancelled used to have no + at all, which
  left free seats beside a booking with no way to fill them.
- A guest added to a party that sits nowhere, every one of its guests having
  been cancelled, is seated the way a new booking is: the table with least
  room to spare that still has some. A party with live guests who merely have
  no table yet is left alone, since that is one the manager is placing by
  hand.
- **Regular guests.** Each guest's row carries a Regular tick, last of the
  guest's fields, after the ticket price. A guest ticked there is written into
  the next event as it is created, at the same table, and stays ticked so it
  happens again.
  They arrive as one party called "Regular", which can be renamed like any
  other, and the new name carries on from then.
  - Ticking puts the guest on a **standing list of regulars**, kept with the
    settings rather than with any event, along with the table they sit at.
    Every new event is built from that list.
  - **Settings > Regulars** is where the list is read and pruned. Taking
    somebody off there is the only thing that stops them being added to new
    events, and it unticks them wherever they are ticked.
  - They are seated at the same table number, always, so long as the new room
    has that table. A room laid out without it leaves them unseated, and the
    party is tinted amber until they are placed.
  - Nobody arrives having paid: it is a different event.
  - They start on the cheapest of the new event's ticket prices, which is
    where any new guest starts.
  - A guest cancelled off the last event is still a regular, but does not
    come: the cancellation was about that night.
- A party with any guest still unseated is tinted amber on the bookings
  screen, so it can be found while scrolling. A wholly cancelled party is
  not: nobody in it has a seat and nobody in it is coming.
- **A guest is a row of columns where the party is wide enough for them, and
  one compact line where it is not.** The columns need 594px; the party card
  measures itself and shows a table above 38rem of its own width. That is a
  question about the card and not about the window: the bookings list runs two
  parties abreast on a wide screen, so a party can be narrow inside a large
  monitor, and a tablet holding one party per row can be narrower still.
  - **The compact line** is the guest's name, their status as a word beneath
    it, the table as a dropdown, a pencil, and a cross. Three things can be
    done from there and no more: change the table, cancel that one guest, or
    open the full detail. Ten guests are then ten lines rather than ten cards
    of six dropdowns, and the two facts worth scanning for — who, and have
    they paid — are the two the line leads with.
  - **The pencil is the same button an expense line carries**, in the same
    place and the same 40 by 44, so the two compact lists are read the same
    way. Tapping the name or the rest of the line opens the detail as well;
    that is a guest line's own affordance, since an expense line has no part
    of it that is not a control.
  - One **heading row** names those columns for the whole party, *Guest* and
    *Table*, rather than a label above every dropdown: a label per guest would
    cost a line of height on each of them, which is the room the compact line
    exists to save. Only two of the three cells are named — a name reads as a
    name and "Paid" reads as a status, but a bare number beside a red cross
    does not read as a table until something says so.
  - **The full detail opens over the screen**, with every field on it: name,
    status, table, ticket price, the Regular tick and Cancel guest. It is the
    same arrangement the columns hold, stacked. Fields commit as they are
    left, exactly as they do in the table, so Done only closes it; Escape, the
    cross and a press outside close it too, and cancelling the guest from
    inside closes it because there is no longer a guest to show.
  - **The batch-move ticks belong to the table.** Picking several guests to
    move together needs room to show what was picked, so the compact line has
    no tick and the party has no Select all beside it; the table keeps both.
  - The fields are in one order either way — see **Typing a list** — which is
    why the status sits beside the name in the columns too.
- **The bookings list runs two parties abreast once each half can hold the
  guest columns**, which is 1536px and not 1280px. A party is capped at 54rem
  so that a single one on a wide screen does not stretch its name field across
  the window.

### Expenses
- Add line items (description + amount) per event. The blank line to type
  into appears when Add, at the top right of the screen, is pressed, and goes
  again once the line is saved or discarded.
- Enter saves the blank line and opens another below it with the cursor in
  it, and Enter on a line already in the list does the same, so a list of
  costs is typed straight down. The Save button saves without opening
  another.
- **A line is a row of columns where the list is wide enough for them, and one
  compact line where it is not.** The columns need 624px; the list measures
  itself and shows them above 40rem of its own width.
  - **The compact line** is the description, the amount, the paid tick, a
    button for the two fields it does not carry, and a cross. Four things can
    be done from it: retype or re-pick the description, retype the amount,
    tick it paid, or clear it — and the button opens the rest.
  - **Provider and notes open over the screen.** The notes are one editable
    block holding everything written about that cost, because an expense
    carries a single notes value; the panel is a taller box for it, never a
    new box per note.
  - Clearing is grey rather than red, unlike cancelling a guest: the line goes
    to the saved lines and can be picked back out, so it is not a one-way
    door.
  - One **heading row** names the compact columns for the whole list.
- **The header on a narrow Expenses screen is the total and what is still to
  pay**, and the total at the foot of the list goes with the columns, so a
  figure is never printed twice on one short screen. Add is a **+** there,
  Clear all lines keeps its words.
- Auto-copied forward whenever a new event is created
- When a line item is removed, keep it in memory to be selected from a dropdown for a next event
- Option to permanently delete line items that will not be used again in the future

### Dashboard (per active event)
The six figures are a row of cards on a desktop and a stack of one-line cards
on a phone: one card per line, label at the left and figures at the right, so
the whole set is read without scrolling. Show all six of the following,
always in this order:
1. Table list with seat count and assigned attendee names per table, and a
   line naming anyone not yet seated. Following it opens the bookings screen
   at the parties they belong to rather than at the top of the list.
2. Total seats still available across all tables — the room less every
   confirmed guest, whether or not they have been seated yet. A guest with no
   table still needs a chair, so counting only the chairs being sat in
   overstates what is left to sell.
3. Total number of bookings
4. Total amount due — sum of ticket prices for `pay_at_venue` attendees only
5. Total expenses for the event
6. Total expected income — sum of ticket prices for `paid` +
   `pay_at_venue` attendees combined
7. Total expected profit for the event   

### Auto-close & retention
- An event auto-closes 48 hours after its event date has passed
- Closed event data is kept for 2 weeks by default — a global setting,
  changeable in Settings, shorter as well as longer. The original wording was
  "changeable to a longer period" and the floor that came from it was asked
  off: how long a finished event is kept is the manager's business. Zero is
  allowed and means a closed event is deleted by the sweep that closes it,
  never appearing under Closed. Shortening the period names the closed events
  it would delete before it is saved.
- After the retention window expires, that event's data is auto-deleted,
  with no prompt beforehand
- On desktop, the user picks a save folder once (via the folder-picker);
  it's remembered and reused for all future exports. It is chosen and changed
  on the Export/Import screen rather than in Settings, since that is where it
  is used. On mobile, skip this — there is no remembered folder

### Export and import
- Reached from the section nav as "Export/Import your data", available at any
  time. Export and import sit side by side on the one screen.
- Export covers current and future events by default; "all events" and a
  tick-list of any events wanted are both offered.
- Three things can be exported: a backup, a set of reports, and the door
  list. Format choice per one of them.
  - **JSON** is the backup: the events as they are held, and the only format
    import reads.
  - **CSV** is a report, not a backup: three spreadsheets — guests, tables,
    expenses — with the event name and date repeated down each row. An event
    is nested and a spreadsheet is a grid, so nothing reads them back.
  - **Tables and guests** is the list the door works from on the night: one
    file per event, and the columns are a tick box, table number, guest name
    and paid. Paid reads "yes" where the money is in and is left blank where
    the guest pays at the venue, so it can be written into as they arrive; a
    guest who is not paying at all reads "no charge". Cancelled guests are
    left off. Written three ways, all of them the same rows: an Excel
    workbook, `.xls`, that opens on a double-click and can be ticked and
    typed into; a self-contained web page with real tick boxes and fields,
    which remembers what is ticked and typed in the browser it is opened in
    and prints as a clean list; or plain CSV.
  - Excel `.xlsx` was in the earlier wording and is not what is written. A
    `.xlsx` is a zip archive and would mean a library, which the dependency
    rule above forbids. SpreadsheetML is a single XML file, is Excel's own
    format, and needs nothing.
- Desktop: saved to the chosen folder. The folder is remembered, and before
  every export the user is asked whether it is still the right one, with the
  folder-picker one press away if it is not. Mobile, and any browser without
  the folder API: delivered via the browser's normal save/share prompt, where
  there is no folder to remember and none is asked about.
- Import reads a JSON backup, lists what is in it, and lets any of it be left
  out. What happens to events already stored is a choice: **add what is
  missing** by default, leaving anything already there untouched, or
  **replace everything**, which empties the store first and is confirmed
  before it runs.

### Settings
- One screen for the things that are true of the app rather than of an event.
- Each setting is a closed line showing its name and what it is currently set
  to, and opens when asked. One at a time.
- **How long a closed event is kept** — see Auto-close & retention above.
- **Seats a new table starts with** — the spec's default is 10; a room laid
  out in eights or twelves should not be retyped table by table. Any table can
  still be given a different number.
- **How a new event repeats** has no line here, and no setting behind one: it
  is asked on the New event form and forgotten with the form. It is named in
  this list only because earlier versions of this spec kept it, and a reader
  comparing the two should not have to guess whether it was dropped or
  overlooked.
- **Currency** — chosen from a list, not typed as a symbol. The spec names no
  currency, so the default is none, which is what the app did before. The
  currency decides the symbol, which side of the figure it sits and what
  separates the thousands, all of which the browser already knows. On screen
  only: exports keep writing bare numbers, because a symbol in a spreadsheet
  cell makes it text and a spreadsheet cannot add up text.
- **Delete everything** — every event and every saved expense line, named and
  counted before it runs and gone for good after. Settings themselves stay,
  including the export folder, which is where the backup was just written.
- Which folder exports are written to.
- The export folder is shown and can be forgotten here, but is chosen on
  Export/Import — the picker has to open inside the press that exports, or
  the browser refuses it.

### Typing a list
- **Enter** goes to the same field on the line below. At the bottom of the
  list it makes the next line and goes to that: another expense line, or
  another guest on the party.
- **Tab** goes to the next field to the right, which is the browser's own
  behaviour and is left to it. Nothing on any screen reorders itself visually
  away from the order its fields are written in, which is the one thing that
  would put Tab out of step with the eye.
- That holds at every width. A screen that stacks its columns into a card on
  a phone stacks them in the order they are written, top to bottom; it never
  moves a field with `order-*`, a reversed flex direction or a grid line. So
  where a card wants a field earlier than the columns did, the field moves in
  the markup and the columns follow it, rather than the two orders being
  allowed to disagree.
- The lists this applies to are the ones with fields in them: the expense
  lines, and the guests of a party.

## Explicitly out of scope
- Visual/drag-and-drop floor plan (tables are a numbered list only)
- Multi-user support, roles, or permissions
- Any network calls, telemetry, or analytics
