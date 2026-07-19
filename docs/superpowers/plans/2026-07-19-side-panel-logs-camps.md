# Side Panel: LOGs and CAMPs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible side panel to the Van Dog Traveller route map listing every dated track ("LOG", one per GPX `<trk>`) and every camp stopover ("CAMP", one per GPX `<wpt>`), so clicking an entry pans/zooms the map to it and highlights it.

**Architecture:** Extend `parseGpx` to also extract per-track (`<trk>`) metadata into a `logs` array (currently discarded — only flattened polyline points are kept). Extend `buildMap` to keep a live reference from each log/stopover to its Leaflet layer/marker. Add a new `buildPanel` function that renders two list sections into a fixed side panel and wires click-to-select behavior with a single shared "selected entity" state.

**Tech Stack:** Vanilla JS, Leaflet 1.9.4 (already loaded via CDN in `index.html`), no build step, no test framework.

## Global Constraints

- No dependencies beyond the existing Leaflet CDN bundle — do not add npm/build tooling.
- This project has **no automated test runner** (per `CLAUDE.md`: "There is no build or test tooling"). Every "test" step in this plan is a manual verification step: serve the directory with `python3 -m http.server 8000` from the project root, open `http://localhost:8000/` in a browser, and check the described behavior/console output. Do this instead of writing/running unit tests.
- Keep the raw GPX `<name>` strings verbatim as display labels for both logs and camps — never reformat them into just a date or paraphrase them.
- Preserve existing behavior: current-location determination (latest-dated stopover), popup content/escaping, and hover/click marker interaction rules are unchanged.
- Follow the existing single-file structure — all JS stays in `app.js`, all styles in `style.css`, matching current project conventions.

---

### Task 1: Extract per-track LOG data and keep layer/marker references

**Files:**
- Modify: `app.js:28-50` (`parseGpx`)
- Modify: `app.js:78-137` (`buildMap`)
- Modify: `app.js:139-149` (fetch pipeline)

**Interfaces:**
- Consumes: existing `text()`, `parseWaypointDate()`, `bindMarkerInteractions()` helpers (unchanged).
- Produces:
  - `parseGpx(xml)` returns `{ stopovers, logs }` where `logs` is `Array<{ name: string, date: Date|null, coords: [number, number][] }>` (one entry per `<trk>`, replacing the old flat `trkSegs`).
  - `buildMap({ stopovers, logs })` returns `{ map: L.Map, stopovers, logs, currentLocation }`. Each `logs[i]` gains a `.layer` property (the `L.Polyline`, or `undefined` if the log had ≤1 point). Each stopover object (including `currentLocation`) gains a `.marker` property (the `L.Marker`).
  - `currentLocation` is the same stopover object as before (latest-dated stopover), or `null`.

- [ ] **Step 1: Replace `trkSegs` extraction with `logs` extraction in `parseGpx`**

Replace the whole `parseGpx` function (`app.js:28-50`) with:

```js
function parseGpx(xml) {
  const wptNodes = Array.from(xml.querySelectorAll("wpt"));
  const stopovers = wptNodes.map((node) => {
    const name = text(node, "name");
    const desc = text(node, "desc") || text(node, "cmt");
    return {
      lat: parseFloat(node.getAttribute("lat")),
      lon: parseFloat(node.getAttribute("lon")),
      name,
      note: desc,
      date: parseWaypointDate(name),
    };
  });

  const trkNodes = Array.from(xml.querySelectorAll("trk"));
  const logs = trkNodes.map((node) => {
    const name = text(node, "name");
    const coords = Array.from(node.querySelectorAll("trkpt")).map((pt) => [
      parseFloat(pt.getAttribute("lat")),
      parseFloat(pt.getAttribute("lon")),
    ]);
    return { name, date: parseWaypointDate(name), coords };
  });

  return { stopovers, logs };
}
```

- [ ] **Step 2: Update `buildMap` to render per-log polylines and keep layer/marker references**

Replace the whole `buildMap` function (`app.js:78-137`) with:

```js
function buildMap({ stopovers, logs }) {
  const map = L.map("map", { zoomControl: true });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  logs.forEach((log) => {
    if (log.coords.length > 1) {
      log.layer = L.polyline(log.coords, { color: ROUTE_COLOR, weight: 3, opacity: 0.75 }).addTo(map);
    }
  });

  const dated = stopovers.filter((s) => s.date);
  const undated = stopovers.filter((s) => !s.date);
  dated.sort((a, b) => a.date - b.date);

  const currentLocation = dated.length ? dated[dated.length - 1] : null;
  const pastStopovers = dated.length ? dated.slice(0, -1).concat(undated) : undated;

  const hoverCapable = window.matchMedia("(hover: hover)").matches;

  pastStopovers.forEach((point) => {
    const marker = L.marker([point.lat, point.lon], {
      icon: L.divIcon({
        className: "",
        html: '<div class="stopover-dot"></div>',
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      }),
    }).addTo(map);
    point.marker = marker;
    bindMarkerInteractions(marker, point, false, hoverCapable);
  });

  if (currentLocation) {
    const marker = L.marker([currentLocation.lat, currentLocation.lon], {
      icon: L.divIcon({
        className: "",
        html: '<div class="current-location-marker"><div class="pulse-ring"></div><div class="pulse-dot"></div></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      zIndexOffset: 1000,
    }).addTo(map);
    currentLocation.marker = marker;
    bindMarkerInteractions(marker, currentLocation, true, hoverCapable);
  }

  const allPoints = logs
    .flatMap((log) => log.coords)
    .concat(stopovers.map((s) => [s.lat, s.lon]));

  if (allPoints.length) {
    map.fitBounds(L.latLngBounds(allPoints), { padding: [20, 20] });
  } else {
    map.setView([48, 10], 4);
  }

  return { map, stopovers, logs, currentLocation };
}
```

- [ ] **Step 3: Update the fetch pipeline to keep the `buildMap` result around**

Replace the bottom of `app.js` (`app.js:139-149`) with:

```js
fetch(GPX_FILE)
  .then((res) => res.text())
  .then((str) => new DOMParser().parseFromString(str, "application/xml"))
  .then((xml) => buildMap(parseGpx(xml)))
  .catch((err) => {
    document.getElementById("map").innerHTML =
      '<p style="padding:2rem;font-family:sans-serif;">Could not load map data: ' +
      escapeHtml(err.message) +
      "</p>";
    console.error(err);
  });
```

(No functional change yet — `buildMap`'s return value isn't consumed until Task 3. This step just confirms the pipeline still runs top-to-bottom without errors.)

- [ ] **Step 4: Manual verification — map renders identically to before**

Run: `python3 -m http.server 8000` from `/Users/mikehudson/Developer/vdt-map`, then open `http://localhost:8000/` in a browser.

Expected:
- No errors in the browser console.
- The route polyline, camp dots, and pulsing current-location marker all look the same as `current-map.png` in the repo root (use it as a visual reference — nothing about rendering should have changed in this task).
- Hovering/clicking a camp dot still opens its popup as before.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "refactor: extract per-track log data and keep layer/marker refs"
```

---

### Task 2: Panel skeleton, styling, and toggle behavior

**Files:**
- Modify: `index.html:11-16`
- Modify: `style.css` (append)
- Modify: `app.js` (append `setupPanelToggle`, call it)

**Interfaces:**
- Consumes: none (DOM/CSS only, no data dependency).
- Produces: DOM elements `#panel-toggle`, `#panel`, `#panel.open` (CSS class), `#camps-list`, `#logs-list` — Task 3 populates the two `<ul>` elements and reads/toggles `#panel`'s `open` class indirectly through selection, but does not need to manage the toggle button itself.

- [ ] **Step 1: Add panel markup to `index.html`**

Replace `index.html:11-16`:

```html
<body>
<div id="map"></div>
<button id="panel-toggle" aria-label="Toggle trip log panel" aria-expanded="false">☰</button>
<aside id="panel">
  <section id="panel-camps">
    <h2>Camps</h2>
    <ul id="camps-list"></ul>
  </section>
  <section id="panel-logs">
    <h2>Logs</h2>
    <ul id="logs-list"></ul>
  </section>
</aside>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="app.js"></script>
</body>
```

- [ ] **Step 2: Append panel styles to `style.css`**

Add to the end of `style.css`:

```css
/* Side panel */
#panel-toggle {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 1100;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: none;
  background: #2b2b2b;
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

#panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 300px;
  height: 100%;
  background: #fff;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  z-index: 1050;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.2s ease-out;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #2b2b2b;
}

#panel.open {
  transform: translateX(0);
}

@media (max-width: 480px) {
  #panel {
    width: 85vw;
  }
}

@media (min-width: 768px) {
  #panel {
    width: 320px;
  }
}

#panel section {
  flex: 1 1 50%;
  overflow-y: auto;
  padding: 12px 14px;
  min-height: 0;
}

#panel h2 {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #d9743a;
  margin: 0 0 8px;
  position: sticky;
  top: 0;
  background: #fff;
}

#panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

#panel li {
  padding: 6px 4px;
  font-size: 13px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
}

#panel li:hover {
  background: #f5f3ef;
}

#panel li.active {
  background: #fdeee5;
  font-weight: 600;
}

.panel-current-tag {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #2f9e6e;
  vertical-align: middle;
}

.panel-selected .stopover-dot {
  box-shadow: 0 0 0 3px rgba(217, 116, 58, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.panel-selected .current-location-marker .pulse-dot {
  box-shadow: 0 0 0 3px rgba(217, 116, 58, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.3);
}
```

- [ ] **Step 3: Add panel toggle logic to `app.js`**

Add this function near the top of `app.js` (after the constants, before `parseWaypointDate`), and call it once, unconditionally, near the bottom of the file (it doesn't depend on GPX data):

```js
function setupPanelToggle() {
  const panel = document.getElementById("panel");
  const toggle = document.getElementById("panel-toggle");
  const desktopQuery = window.matchMedia("(min-width: 768px)");

  function setOpen(open) {
    panel.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }

  setOpen(desktopQuery.matches);
  toggle.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
}
```

Call it right after the fetch pipeline (order doesn't matter since they're independent):

```js
setupPanelToggle();
```

- [ ] **Step 4: Manual verification — toggle and responsive default state**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`.

Expected, at desktop width (browser window ≥768px wide):
- The panel is visible on load, slid in from the right, showing empty "Camps" and "Logs" headers (lists are empty until Task 3).
- Clicking the `☰` button in the top-right slides the panel out; clicking again slides it back in.

Expected, using devtools device toolbar at a narrow width (e.g. 375px) and reloading the page:
- The panel starts off-screen (collapsed).
- Clicking `☰` slides it in, overlaying the map; clicking again slides it back out.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css app.js
git commit -m "feat: add collapsible side panel skeleton with responsive default state"
```

---

### Task 3: Populate LOGS/CAMPS lists and wire up selection behavior

**Files:**
- Modify: `app.js` (append `sortForPanel`, `renderList`, `clearSelection`, `selectLog`, `selectCamp`, `buildPanel`; update fetch pipeline)

**Interfaces:**
- Consumes: `buildMap`'s return value `{ map, stopovers, logs, currentLocation }` (from Task 1), `#camps-list`/`#logs-list` DOM nodes (from Task 2), `ROUTE_COLOR` constant (existing).
- Produces: `buildPanel({ map, stopovers, logs, currentLocation })` — call this once, right after `buildMap`, with its return value.

- [ ] **Step 1: Add a highlight color constant**

Near `ROUTE_COLOR` at the top of `app.js` (`app.js:2`), add:

```js
const HIGHLIGHT_COLOR = "#d9743a";
```

- [ ] **Step 2: Add sorting and rendering helpers**

Append to `app.js`:

```js
function sortForPanel(entries) {
  const withDate = entries.filter((e) => e.date).sort((a, b) => b.date - a.date);
  const withoutDate = entries.filter((e) => !e.date);
  return withDate.concat(withoutDate);
}

function renderList(listEl, entries, onSelect, currentEntry) {
  entries.forEach((entry) => {
    const li = document.createElement("li");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = entry.name;
    li.appendChild(nameSpan);
    if (entry === currentEntry) {
      const tag = document.createElement("span");
      tag.className = "panel-current-tag";
      tag.textContent = "CURRENT";
      li.appendChild(tag);
    }
    li.addEventListener("click", () => onSelect(entry, li));
    entry.listItem = li;
    listEl.appendChild(li);
  });
}
```

- [ ] **Step 3: Add selection state and select/clear functions**

Append to `app.js`:

```js
let selected = null;

function clearSelection() {
  if (!selected) return;
  if (selected.kind === "log") {
    if (selected.entry.layer) {
      selected.entry.layer.setStyle({ color: ROUTE_COLOR, weight: 3 });
    }
  } else {
    const el = selected.entry.marker.getElement();
    if (el) el.classList.remove("panel-selected");
  }
  if (selected.entry.listItem) selected.entry.listItem.classList.remove("active");
  selected = null;
}

function selectLog(entry, map) {
  clearSelection();
  if (entry.layer) {
    entry.layer.setStyle({ color: HIGHLIGHT_COLOR, weight: 5 });
    entry.layer.bringToFront();
  }
  if (entry.listItem) entry.listItem.classList.add("active");
  selected = { kind: "log", entry };
  if (entry.coords.length) {
    map.fitBounds(L.latLngBounds(entry.coords), { padding: [20, 20] });
  }
}

function selectCamp(entry, map) {
  clearSelection();
  const el = entry.marker.getElement();
  if (el) el.classList.add("panel-selected");
  if (entry.listItem) entry.listItem.classList.add("active");
  selected = { kind: "camp", entry };
  map.setView([entry.lat, entry.lon], Math.max(map.getZoom(), 12));
  entry.marker.openPopup();
}
```

- [ ] **Step 4: Add `buildPanel` and wire it into the fetch pipeline**

Append to `app.js`:

```js
function buildPanel({ map, stopovers, logs, currentLocation }) {
  const campsList = document.getElementById("camps-list");
  const logsList = document.getElementById("logs-list");

  renderList(campsList, sortForPanel(stopovers), (entry) => selectCamp(entry, map), currentLocation);
  renderList(logsList, sortForPanel(logs), (entry) => selectLog(entry, map), null);
}
```

Update the fetch pipeline (previously set in Task 1, Step 3) to call it:

```js
fetch(GPX_FILE)
  .then((res) => res.text())
  .then((str) => new DOMParser().parseFromString(str, "application/xml"))
  .then((xml) => buildPanel(buildMap(parseGpx(xml))))
  .catch((err) => {
    document.getElementById("map").innerHTML =
      '<p style="padding:2rem;font-family:sans-serif;">Could not load map data: ' +
      escapeHtml(err.message) +
      "</p>";
    console.error(err);
  });
```

- [ ] **Step 5: Manual verification — lists populate correctly**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`.

Expected:
- The "Camps" section lists all camp stopovers, newest date first, each showing its raw GPX name (e.g. `camp g2.1 05/1/2026`) unmodified.
- The topmost entry in "Camps" (most recent date) shows a green "CURRENT" tag next to its name.
- The "Logs" section lists all track entries, newest date first, each showing its raw GPX name (e.g. `a1.2.LOG: 10/03/2014`) unmodified.

- [ ] **Step 6: Manual verification — click-to-select behavior**

With the same page open:

1. Click the topmost (most recent) entry in the "Camps" list.
   - Expected: the map pans/zooms to that marker, its popup opens, the marker gets a small orange ring highlight, and the list item becomes bold/highlighted.
2. Click any entry in the "Logs" list.
   - Expected: the map fits to that day's full route bounds, that day's polyline turns orange and thickens, the previous camp's ring highlight disappears, its list item un-bolds, and the clicked log's list item becomes bold/highlighted.
3. Click a different entry in the "Camps" list.
   - Expected: the previously-highlighted log polyline reverts to the default blue color/weight, and the new camp marker gets the highlight instead.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: populate side panel lists and wire up click-to-select highlighting"
```

---

### Task 4: Full regression pass and documentation update

**Files:**
- Modify: `CLAUDE.md` (Architecture section)

**Interfaces:**
- Consumes: none — this is verification plus a doc update, no new code interfaces.
- Produces: none.

- [ ] **Step 1: Update `CLAUDE.md`'s Architecture section**

In `CLAUDE.md`, replace this bullet:

```
  2. `parseGpx` extracts two things from the GPX: `wpt` nodes become `stopovers` (lat/lon/name/note/date), and `trk > trkseg > trkpt` sequences become `trkSegs` (polyline coordinate arrays).
```

with:

```
  2. `parseGpx` extracts two things from the GPX: `wpt` nodes become `stopovers` (lat/lon/name/note/date), and `trk` nodes become `logs` (name/date/coords) — one entry per day's route, keeping the raw GPX name string for display rather than reformatting it.
```

And replace this bullet:

```
  4. `buildMap` renders: track polylines, one small dot marker per past stopover, and a distinct pulsing marker for the **current location** — defined as the stopover with the *latest* parsed date (`dated[dated.length - 1]`), not necessarily the last waypoint in file order. All other dated stopovers plus all undated ones render as regular past-stopover dots.
```

with:

```
  4. `buildMap` renders: one polyline per log, one small dot marker per past stopover, and a distinct pulsing marker for the **current location** — defined as the stopover with the *latest* parsed date (`dated[dated.length - 1]`), not necessarily the last waypoint in file order. All other dated stopovers plus all undated ones render as regular past-stopover dots. Each log/stopover keeps a live reference to its Leaflet layer/marker (`log.layer`, `stopover.marker`) so the side panel can highlight and pan/zoom to it.
  5. `buildPanel` renders the side panel (`#panel` in `index.html`): a "Camps" list and a "Logs" list, both sorted newest-first by raw GPX name (undated entries last). Clicking an entry pans/zooms the map to it and highlights it (polyline color/weight for logs, a ring around the marker for camps); only one entry is ever highlighted at a time, tracked via a single module-level `selected` variable. The panel is open by default on desktop (`min-width: 768px`) and collapsed on mobile, toggled via `#panel-toggle`.
```

- [ ] **Step 2: Full manual regression pass**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`.

Check all of the following in one pass:
- Desktop width: panel open by default, both lists populated, newest-first.
- Resize to mobile width (or use devtools device toolbar) and reload: panel collapsed by default; toggle button opens/closes it as an overlay.
- Click through 3-4 different Camps entries and 3-4 different Logs entries in sequence, confirming each new selection clears the previous highlight (marker ring or polyline color) and only one thing is ever highlighted.
- Hover/click a camp dot directly on the map (not via panel) — existing popup hover/click behavior from `bindMarkerInteractions` still works unchanged.
- Confirm the current-location pulsing marker still appears at the same place as in `current-map.png`, and its Camps list entry still shows the "CURRENT" tag.
- Check the browser console for errors throughout.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document side panel architecture in CLAUDE.md"
```
