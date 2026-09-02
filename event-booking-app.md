# Event Booking & Table Manager — Build Spec

## What this is
A local web app that replaces a physical diary for managing event bookings,
table placements, attendee payment status, and expenses. Used by a single
event manager for now. (The app may evolve into a bigger app, with more functionality to cater to more than one event manager.  This is not currently part of the spec)

## Tech stack
- This is a Next.js project

## Non-negotiable rules
1. The app runs locally via `npm run dev` and is checked at `localhost:3002`.
2. There is **no deployment step** and **no public URL**. Do not add hosting
   config, CI/CD, or deployment scripts of any kind.
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

### Events
- Up to 4 active events at a time, switchable via tabs
- Each event has its own tables, bookings and expenses
- "New Event" duplicates the previous event's expense list as a starting
  point (still editable/removable)

### Tables
- Simple numbered list, no visual floor plan yet.  
- Default 10 seats per table; editable per table, per event
- Add/remove tables freely

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
- Any deployment/build-for-production tooling beyond local dev
