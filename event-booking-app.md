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
- **Table**: id, table number, seat count (default 10)
- **Booking**: id, party name, list of attendees, telephone manditory
- **Attendee**: id, name, assigned table Number (nullable), status, telephone optional
  (`paid` | `pay_at_venue` | `not_paying` | `cancelled`), ticket price
- **Expense**: id, description, amount

## Core features

### App header
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
- Each event has its own tables, bookings and expenses
- "New Event" duplicates the previous event's expense list as a starting
  point (still editable/removable)

### Tables
- Simple numbered list, no visual floor plan yet.  
- Default 10 seats per table; editable per table, per event
- Add/remove tables freely, and change their seats, on Manage events: at the
  foot of the New event form when the event is scheduled, and in the event's
  own row afterwards. That is the only place an event is laid out.
- No Tables screen of its own. The dashboard's seating list is where the
  tables are read: each with its seats, what is free and who is at it.
- Removing a table unseats whoever was at it; they return to the unseated
  pool rather than being cancelled.

### Bookings & attendees
- Creating a booking = party name + guest count → generates that many
  attendee records
- Each attendee: name, table assignment, status, ticket price (defaults
  from the booking's price but is editable per attendee)
- **Cancel whole booking**: sets all attendees in the party to `cancelled`,
  frees their seats
- **Cancel part of a booking**: cancel individual attendees within a party
  without touching the rest

### Expenses
- Add line items (description + amount) per event
- Auto-copied forward whenever a new event is created
- When a line item is removed, keep it in memory to be selected from a dropdown for a next event
- Option to permanently delete line items that will not be used again in the future

### Dashboard (per active event)
Show all six of the following, always in this order:
1. Table list with seat count and assigned attendee names per table
2. Total seats still available across all tables
3. Total number of bookings
4. Total amount due — sum of ticket prices for `pay_at_venue` attendees only
5. Total expenses for the event
6. Total expected income — sum of ticket prices for `paid` +
   `pay_at_venue` attendees combined
7. Total expected profit for the event   

### Auto-close & retention
- An event auto-closes 48 hours after its event date has passed
- Closed event data is kept for 2 weeks by default — a global setting,
  changeable to a longer period in Settings
- After the retention window expires, that event's data is auto-deleted,
  with no prompt beforehand
- On desktop, the user picks a save folder once (via the folder-picker);
  it's remembered and reused for all future exports, and changeable in
  Settings. On mobile, skip this — there is no remembered folder

### Manual export / backup
- "Export All Data" action, available anytime, select one or all from past, current, and/or
  future events
- Format choice: Excel or JSON, meant as a full backup/restore file
- Desktop: saved to the chosen folder. Mobile: delivered via the browser's
  normal save/share prompt

## Explicitly out of scope
- Visual/drag-and-drop floor plan (tables are a numbered list only)
- Multi-user support, roles, or permissions
- Any network calls, telemetry, or analytics
