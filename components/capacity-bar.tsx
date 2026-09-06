/**
 * One bar for every filled-against-free quantity in the app.
 *
 * A room's seats, a single table's seats, and what has been paid of what has
 * been spent are all the same shape of fact: some of a known total is taken
 * and the rest is not. They were four different sentences before this, on
 * four screens, and the only way to tell a table that was nearly full from
 * one that was nearly empty was to do the subtraction.
 *
 * Royal blue fills a light blue track. The track is `--track`, which is the
 * accent doing the quietest job it has, and the fill is the primary - so a
 * bar is the palette's two blues and nothing else.
 *
 * Except when it overflows. A room can be booked past its seats in this app,
 * and a bar that simply sat at 100% would say the room was exactly full at
 * the moment it stopped being able to hold everyone. Past the total it fills
 * completely and turns the attention orange, the same orange the seats-short
 * figure and the unseated pill already use.
 *
 * The numbers do not go away. The bar is drawn beside or beneath the words
 * that were already there, because "6 free" is what somebody seats a party
 * by and a length on a screen is not a number. What the bar adds is that a
 * screen of them can be read at a glance instead of one at a time.
 */

interface Props {
  /** How much of the total is taken. May exceed it. */
  filled: number;
  /** How much there is. Nothing is drawn when there is nothing to fill. */
  total: number;
  /**
   * What a screen reader says instead of the bar. The bar is a picture of a
   * sentence that is already on the screen, so this repeats that sentence
   * rather than inventing a new one.
   */
  label: string;
  /** A hook for the checks, on the bar itself. */
  marker?: string;
}

export function CapacityBar({ filled, total, label, marker }: Props) {
  // A bar of nothing out of nothing is a rule across the page saying
  // nothing. An event with no tables yet has exactly that, and says so in
  // words elsewhere.
  if (total <= 0) return null;

  const over = filled > total;
  const percent = Math.min(100, Math.max(0, (filled / total) * 100));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(filled, total)}
      aria-label={label}
      data-capacity-bar={marker}
      data-capacity-over={over ? "" : undefined}
      className="h-1.5 w-full overflow-hidden rounded-full bg-track"
    >
      {/* Width is the one thing here that cannot be a class: it is a number
          the event decides, not one of a set the stylesheet could hold. */}
      <div
        className={`h-full rounded-full transition-[width] ${
          over ? "bg-cta" : "bg-primary"
        }`}
        style={{ width: `${over ? 100 : percent}%` }}
      />
    </div>
  );
}
