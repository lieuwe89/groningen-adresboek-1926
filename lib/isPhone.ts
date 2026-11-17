// Phones are everything under Tailwind's `md` (768px): the `max-md:` classes restyle, this decides behaviour.
//
// `max-md:[zoom:1.3]` on a block: the panels are drawn for a 295px column in 7.5-11px type, with every
// size inline. Phones scale the text parts up instead of restyling each one (375 / 1.3 is almost exactly
// that column). Never on the map or the scan viewer: zoom shifts their pointer coordinates.

/** Call from event handlers only (there is no window during SSR). */
export const isPhone = () => window.matchMedia("not all and (min-width: 48rem)").matches // the query Tailwind emits for max-md;
