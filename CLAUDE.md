# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, single-page Leaflet map ("Van Dog Traveller — Route Map") that visualizes a GPX track and its waypoints. No build step, no package manager, no dependencies beyond the Leaflet CDN bundle loaded in `index.html`.

## Running / testing

There is no build or test tooling. To preview locally, serve the directory with any static file server (needed because `app.js` fetches `track-main.GPX` via `fetch`, which requires HTTP rather than `file://`), e.g.:

```
python3 -m http.server
```

Then open `http://localhost:8000/`.

## Architecture

- `index.html` — loads Leaflet from unpkg, `style.css`, and `app.js`. No framework.
- `app.js` — the entire application logic, in a single fetch → parse → render pipeline:
  1. Fetches `track-main.GPX` and parses it as XML via `DOMParser`.
  2. `parseGpx` extracts two things from the GPX: `wpt` nodes become `stopovers` (lat/lon/name/note/date), and `trk` nodes become `logs` (name/date/coords) — one entry per day's route, keeping the raw GPX name string for display rather than reformatting it.
  3. Waypoint dates are parsed out of the trailing `d/m/yyyy` in each waypoint's `<name>` via `DATE_RE`/`parseWaypointDate` — this is the only place trip dates come from; waypoints without a trailing date are treated as "undated".
  4. `buildMap` renders: one polyline per log, one small dot marker per past stopover, and a distinct pulsing marker for the **current location** — defined as the stopover with the *latest* parsed date (`dated[dated.length - 1]`), not necessarily the last waypoint in file order. All other dated stopovers plus all undated ones render as regular past-stopover dots. Each log/stopover keeps a live reference to its Leaflet layer/marker (`log.layer`, `stopover.marker`) so the side panel can highlight and pan/zoom to it.
  5. `buildPanel` renders the side panel (`#panel` in `index.html`): a "Camps" list and a "Logs" list, both sorted newest-first by raw GPX name (undated entries last). Clicking an entry pans/zooms the map to it and highlights it (polyline color/weight for logs, a ring around the marker for camps); only one entry is ever highlighted at a time, tracked via a single module-level `selected` variable. The panel is open by default on desktop (`min-width: 768px`) and collapsed on mobile, toggled via `#panel-toggle`.
  6. Map auto-fits bounds to all track points + stopovers; falls back to a fixed world view if there's no data.
- `style.css` — styles the Leaflet popup content and the two custom marker types (`.stopover-dot`, `.current-location-marker` with CSS `pulse` keyframe animation).
- `track-main.GPX` — the data source (~2.6MB). To update the current location or add stopovers, edit this file's waypoints directly — there is no separate data/config file.

## Key conventions

- Marker click/hover behavior is unified in `bindMarkerInteractions`: on hover-capable devices (`(hover: hover)` media query), popups open on hover and Leaflet's default click-toggle is overridden to always-open (avoids hover/click race). Touch devices keep Leaflet's default tap-to-toggle behavior.
- Popup content is built as raw HTML strings (`popupHtml`) with manual escaping via `escapeHtml` (uses a detached `div.textContent` trick) — always escape any new user/GPX-derived text inserted into popup HTML.
