# Marker icons: anchor for camps, van for current location

## Goal

Replace the current CSS-drawn dot markers with icon markers: an anchor icon
for past/undated stopovers ("camps"), and a van icon for the current
location.

## Current state

- `buildMap` in `app.js` creates `L.divIcon` markers:
  - Past/undated stopovers: `<div class="stopover-dot"></div>`, a 10px CSS
    circle (`.stopover-dot` in `style.css`), `iconSize: [10, 10]`,
    `iconAnchor: [5, 5]` (centered).
  - Current location: `<div class="current-location-marker">` containing
    `.pulse-ring` (animated, green `#2f9e6e`) and `.pulse-dot` (solid green
    circle), `iconSize: [22, 22]`, `iconAnchor: [11, 11]` (centered).
- `.panel-selected` (applied to the marker's DOM element when a camp is
  selected in the side panel) currently adds a `box-shadow` ring around
  `.stopover-dot` and `.current-location-marker .pulse-dot`.

## Design

- **No new dependencies.** Icons are inline SVG strings defined as constants
  in `app.js`, next to the other HTML-string builders (e.g. `popupHtml`),
  consistent with the "single `app.js`, no assets pipeline" convention.
- **Camp icon:** inline SVG anchor glyph, solid `#d9743a` fill with a white
  stroke/outline for contrast against the map tiles. Roughly 20×20px,
  `iconAnchor` at the icon's center (`[10, 10]`) — same centering behavior as
  today's dot, so no changes needed to popup positioning, `panTo`, or
  highlight math.
- **Current-location icon:** keep the existing `.pulse-ring` pulsing
  animation (green `#2f9e6e`) unchanged. Replace the inner `.pulse-dot`
  circle with an inline SVG van glyph (simple boxy delivery/camper-van
  silhouette, side view), solid green fill matching the pulse color, layered
  on top of the ring. Roughly 22×22px, centered the same way as today.
- **Selection highlight:** since icons are no longer plain circles, replace
  the `box-shadow`-on-circle approach with a circular colored halo
  (`background` disc, same orange highlight color) rendered behind the icon
  via a wrapping div, toggled by the existing `.panel-selected` class. Applies
  to both camp and current-location markers.
- No changes to marker interaction logic (`bindMarkerInteractions`), GPX
  parsing, panel logic, or bounds-fitting — this is a purely visual marker
  swap.

## Out of scope

- Log/polyline styling (unchanged).
- Panel list styling, aside from the `.panel-current-entry::before` dot
  (unchanged — that's a small indicator dot in the list, not a map marker).
