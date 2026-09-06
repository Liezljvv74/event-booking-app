/**
 * One badge for every status the app shows, and one place that decides what
 * colour a status is.
 *
 * Three tones, and only three:
 *
 *   - **confirmed** - royal blue. Somebody has paid, a seat is held, a line
 *     is settled. Nothing is owed and nothing is waiting.
 *   - **due** - orange. Money still to collect, a guest still to seat, a
 *     room booked past its seats. Something wants doing; nothing is wrong
 *     yet, which is why this is not the red.
 *   - **cancelled** - the muted grey. Off the list, closed, gone. Present so
 *     the count can be read, quiet so it is not read first.
 *
 * There is deliberately no fourth. Red belongs to destruction and failure -
 * the Delete button and the storage error - and a status is neither. A
 * status pill that could be red would end up red for "unpaid", which is the
 * ordinary state of most guests until the night.
 *
 * All three are drawn the same way: the tone's tint behind, its line around,
 * and a deeper shade of it for the words. The deeper shade is why
 * `--on-primary-soft` and `--on-cta-soft` exist - the blue that reads on
 * white is too near its own tint to be read on it. Every pairing clears WCAG
 * AA in both themes, four of the six clear AAA.
 *
 * Everything carries `data-status-pill` with its tone, so a check can find
 * every status on a screen and ask what colour it is without knowing which
 * component drew it.
 */

import type { AttendeeStatus } from "@/lib/types";

export type StatusTone = "confirmed" | "due" | "cancelled";

const TONE_CLASS: Record<StatusTone, string> = {
  confirmed: "border-primary-line bg-primary-soft text-on-primary-soft",
  due: "border-cta-line bg-cta-soft text-on-cta-soft",
  cancelled: "border-line bg-muted text-ink-muted",
};

/**
 * Where an attendee's payment state sits among the three.
 *
 * `not_paying` is confirmed rather than cancelled: a guest on the house is
 * coming and holds a seat, and the only thing settled about them is that no
 * money is owed - which is exactly what confirmed means here.
 *
 * Exported because the guest rows show this status in a dropdown rather than
 * a pill. A dropdown is how it is changed, so it stays a dropdown; it takes
 * its colour from here so that a guest reading "Pay at venue" in orange sees
 * the same orange on the party's own "due" pill above them.
 */
export function attendeeTone(status: AttendeeStatus): StatusTone {
  if (status === "cancelled") return "cancelled";
  if (status === "pay_at_venue") return "due";
  return "confirmed";
}

/** The tone's text colour on its own, for the places a pill would not fit. */
export const TONE_TEXT: Record<StatusTone, string> = {
  confirmed: "text-primary",
  due: "text-cta",
  cancelled: "text-ink-muted",
};

interface Props {
  tone: StatusTone;
  children: React.ReactNode;
  /**
   * A hook for the checks, put on the pill itself rather than on a wrapper
   * so that finding the pill and reading its colour are the same query.
   */
  marker?: string;
}

/**
 * Small enough to sit inside a summary line without breaking it: the height
 * comes from the text, the padding is a hair either side, and the whole
 * thing is `inline-flex` so it lines up on the baseline of the sentence it
 * is part of rather than pushing the line taller.
 */
export function StatusPill({ tone, children, marker }: Props) {
  return (
    <span
      data-status-pill={tone}
      data-status-marker={marker}
      className={`inline-flex items-center rounded-full border px-1.5 py-px text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
