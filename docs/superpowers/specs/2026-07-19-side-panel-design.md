# Side Panel: LOGs and CAMPs — Design

## Background

The GPX file (`track-main.GPX`) contains two kinds of dated entities that the map currently under-uses:

- **CAMPs**: `<wpt>` nodes named `"camp a1.2 10/03/2014"` (544 of them). Already parsed into `stopovers` and rendered as dot markers (or the pulsing current-location marker for the latest-dated one).
- **LOGs**: `<trk>` nodes named `"a1.2.LOG: 10/03/2014"` (546 of them), each with one `<trkseg>`. Currently `parseGpx` discards the trk-level `<name>` entirely and flattens all trkseg points into one `trkSegs` array, so individual days' routes aren't addressable.

The goal is a side panel listing both LOGs and CAMPs so a user can jump to any day's route or camp location directly, instead of only seeing the map.

## 1. Data model changes (`app.js`)

- Replace `trkSegs` with a `logs` array built from `<trk>` nodes (not `trk > trkseg`): one entry per trk, `{ name, date, coords }`.
  - `name` is the raw `<name>` text (e.g. `"a1.2.LOG: 10/03/2014"`), kept verbatim — not reformatted.
  - `date` is parsed from the trailing `d/m/yyyy` via the existing `DATE_RE`/`parseWaypointDate`, same as stopovers. A trk without a parseable trailing date is "undated" (no known case in the current file, but the code path must handle it like stopovers do).
  - `coords` is the flattened list of `[lat, lon]` pairs from that trk's single `<trkseg>`.
- Stopovers (`camp ...`) are unchanged in `parseGpx` — same fields, same raw `name` kept verbatim for display (not reformatted to just the date).
- `buildMap` renders one `L.polyline` per log entry (instead of one per flat segment), keeping a reference to each polyline alongside its log data so the panel can look it up (e.g. `logs[i].layer = polyline`).
- Stopover markers: keep a reference to each marker alongside its stopover data the same way (e.g. `stopover.marker = marker`), for both past-stopover dots and the current-location marker.

## 2. Panel UI/layout (`index.html`, `style.css`, `app.js`)

- A fixed side panel, right-hand side, ~300px wide, containing two independently-scrollable sections stacked vertically:
  - **CAMPS** — list of all stopovers (including the current-location one, tagged e.g. "CURRENT").
  - **LOGS** — list of all log entries.
- Each list item displays the raw GPX `name` string as its label (no reformatting). Sort order: **newest first** (descending by parsed date) within each list; undated entries appended at the end of their list.
- A toggle button collapses/expands the panel.
  - Default state uses `matchMedia("(min-width: 768px)")`: open on desktop, collapsed on mobile.
  - On mobile (collapsed default), the panel overlays the map (absolute positioning, slide-in) when opened, rather than shrinking the map's width.
- Panel styling follows the existing muted/earth-tone palette already used for popups (`#2b2b2b` text, `#d9743a` accent, etc.) for visual consistency.

## 3. Interaction & highlight behavior (`app.js`)

- A single module-level "selected entity" reference. Selecting any panel entry (LOG or CAMP) first clears the previous selection's highlight/active state, so only one thing is ever highlighted at a time — across both lists.
- **Clicking a LOG entry**:
  - `map.fitBounds()` to that log's coordinate bounds (with the same padding used for the initial fit).
  - The polyline gets a highlighted style (increased weight + accent color) and is brought to front via `bringToFront()`.
  - The previously-highlighted polyline (if any) reverts to the default `ROUTE_COLOR`/weight.
- **Clicking a CAMP entry**:
  - `map.setView()` to that marker's coordinates, preserving current zoom unless it's below a sensible minimum for viewing a single point.
  - `marker.openPopup()` is called (reusing existing popup content/logic).
  - The marker gets a "selected" CSS class (enlarge/outline treatment); the previously-selected marker (if any) loses that class.
- The corresponding list item gets an `.active` class reflecting the current selection, kept in sync with the map state.
- Undated logs/camps are handled identically to dated ones for click behavior — they just sort to the end of their list.

## Out of scope

- Search/filter within the panel.
- Grouping entries by year or trip leg.
- Any change to how "current location" is determined (still the latest-dated stopover).
- Any change to existing popup content or hover/click marker interaction rules.
