# Marker Icons (Anchor + Van) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS dot markers with an inline-SVG anchor icon for camp stopovers and an inline-SVG van icon for the current location, keeping the existing pulse animation and selection highlight behavior.

**Architecture:** Two inline SVG string constants in `app.js`, used as the `html` of the existing `L.divIcon` calls in `buildMap`. CSS in `style.css` is updated: `.stopover-dot`/`.pulse-dot` circle styling is replaced by icon-sizing rules, and the `.panel-selected` box-shadow-on-circle is replaced by a circular background halo behind the icon.

**Tech Stack:** Vanilla JS, Leaflet (CDN), plain CSS. No build step, no test framework — this repo has none (see CLAUDE.md). Verification is manual: serve with `python3 -m http.server` and check in a browser via Playwright.

## Global Constraints

- No new dependencies — icons must be inline SVG strings in `app.js`, not files or CDN icon libraries.
- No changes to `bindMarkerInteractions`, GPX parsing, panel logic, or bounds-fitting.
- Camp icon: solid `#d9743a` fill, white stroke/outline, ~20×20px, centered anchor (`iconAnchor` at icon center) — matches today's centered-dot behavior so no positioning math changes elsewhere.
- Current-location icon: keep `.pulse-ring` animation unchanged (green `#2f9e6e`); replace only the inner `.pulse-dot` circle with the van SVG, ~22×22px, centered the same way, layered on top of the ring.
- Selection highlight (`.panel-selected`) must work for both camp and current-location markers, using a circular orange halo behind the icon instead of a box-shadow ring.

---

### Task 1: Add SVG icon constants and wire them into `buildMap`

**Files:**
- Modify: `app.js:1-3` (add constants near top-level config), `app.js:172-197` (`buildMap`'s marker creation)

**Interfaces:**
- Produces: `ANCHOR_ICON_SVG` (string constant), `VAN_ICON_SVG` (string constant) — used only within `app.js`.

- [ ] **Step 1: Add the two SVG constants near the top of `app.js`**

Insert after the existing constants (`app.js:1-5`, after `DATE_RE`):

```js
const ANCHOR_ICON_SVG = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="5" r="2.4" fill="#d9743a" stroke="#fff" stroke-width="1.2"/>
  <line x1="12" y1="7.4" x2="12" y2="20" stroke="#d9743a" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="12" y1="20" x2="12" y2="20" stroke="#fff" stroke-width="0"/>
  <path d="M6 14c0 4 2.7 6.5 6 6.5s6-2.5 6-6.5" stroke="#d9743a" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <path d="M6 14c0 4 2.7 6.5 6 6.5s6-2.5 6-6.5" stroke="#fff" stroke-width="0.6" stroke-linecap="round" fill="none"/>
  <line x1="7.5" y1="11.5" x2="16.5" y2="11.5" stroke="#d9743a" stroke-width="2.2" stroke-linecap="round"/>
</svg>`.trim();

const VAN_ICON_SVG = `
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 14.5V9.5C2 8.7 2.7 8 3.5 8H13l5 3.5V14.5H2Z" fill="#2f9e6e" stroke="#fff" stroke-width="1"/>
  <rect x="2" y="8" width="16" height="6.5" fill="#2f9e6e" stroke="#fff" stroke-width="1"/>
  <rect x="13.2" y="9.7" width="4.3" height="3.2" fill="#cdeee0" stroke="#2f9e6e" stroke-width="0.6"/>
  <circle cx="6.5" cy="15.5" r="1.9" fill="#1f2f2a" stroke="#fff" stroke-width="0.8"/>
  <circle cx="15.5" cy="15.5" r="1.9" fill="#1f2f2a" stroke="#fff" stroke-width="0.8"/>
</svg>`.trim();
```

- [ ] **Step 2: Replace the past-stopover marker icon in `buildMap`**

In `app.js`, replace the `pastStopovers.forEach` block (currently `app.js:172-183`):

```js
  pastStopovers.forEach((point) => {
    const marker = L.marker([point.lat, point.lon], {
      icon: L.divIcon({
        className: "",
        html: `<div class="stopover-icon">${ANCHOR_ICON_SVG}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(map);
    point.marker = marker;
    bindMarkerInteractions(marker, point, false, hoverCapable);
  });
```

- [ ] **Step 3: Replace the current-location marker icon in `buildMap`**

Replace the `if (currentLocation)` block (currently `app.js:185-197`):

```js
  if (currentLocation) {
    const marker = L.marker([currentLocation.lat, currentLocation.lon], {
      icon: L.divIcon({
        className: "",
        html: `<div class="current-location-marker"><div class="pulse-ring"></div><div class="pulse-icon">${VAN_ICON_SVG}</div></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      zIndexOffset: 1000,
    }).addTo(map);
    currentLocation.marker = marker;
    bindMarkerInteractions(marker, currentLocation, true, hoverCapable);
  }
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
feat: render camp/current-location markers as anchor and van icons

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Update CSS for icon sizing and selection halo

**Files:**
- Modify: `style.css:49-100` (marker styling), `style.css:204-210` (`.panel-selected` rules)

**Interfaces:**
- Consumes: `.stopover-icon` wrapper div and `.pulse-icon` wrapper div introduced in Task 1's `html` strings; `.current-location-marker`, `.pulse-ring` (unchanged names from before).

- [ ] **Step 1: Replace `.stopover-dot` rule with `.stopover-icon` sizing + halo support**

Replace lines `style.css:49-57`:

```css
/* Stopover icon marker */
.stopover-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.stopover-icon::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: transparent;
}
```

- [ ] **Step 2: Update `.current-location-marker` / pulse rules to size the van icon instead of the dot**

Replace lines `style.css:59-100` (from `/* Current location marker */` through the end of the `@keyframes pulse` block):

```css
/* Current location marker */
.current-location-marker {
  width: 22px;
  height: 22px;
  position: relative;
}

.current-location-marker .pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border-radius: 50%;
  background: rgba(47, 158, 110, 0.45);
  animation: pulse 1.8s ease-out infinite;
}

.current-location-marker .pulse-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.current-location-marker .pulse-icon::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: transparent;
}

@keyframes pulse {
  0% {
    transform: scale(0.6);
    opacity: 0.9;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}
```

- [ ] **Step 3: Replace the `.panel-selected` box-shadow rules with a background halo**

Replace lines `style.css:204-210` (the final two rules in the file, `.panel-selected .stopover-dot` and `.panel-selected .current-location-marker .pulse-dot`):

```css
.panel-selected .stopover-icon::before {
  background: rgba(217, 116, 58, 0.35);
  box-shadow: 0 0 0 2px rgba(217, 116, 58, 0.55);
}

.panel-selected .current-location-marker .pulse-icon::before {
  background: rgba(217, 116, 58, 0.35);
  box-shadow: 0 0 0 2px rgba(217, 116, 58, 0.55);
}
```

Note: Leaflet's `L.divIcon` creates its own outer `<div>` (with Leaflet's internal classes) and sets its `innerHTML` to the `html` string we pass — it does NOT use our `html` string's outer element as the marker's root. So `marker.getElement()` (used by `selectCamp`/`clearSelection` in `app.js`) returns that Leaflet-created outer div, and `.stopover-icon` / `.current-location-marker` are *children* of it. `.panel-selected` lands on the Leaflet-created outer div, so the selectors must be descendant combinators (space), matching the original code's `.panel-selected .stopover-dot` pattern — not a compound selector.

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "$(cat <<'EOF'
style: size marker icons and replace selection box-shadow with halo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Manual visual verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start a local static server**

Run: `python3 -m http.server 8000` (from repo root, in the background)

- [ ] **Step 2: Load the page and inspect markers**

Use Playwright (`mcp__playwright__browser_navigate` to `http://localhost:8000/`, then `mcp__playwright__browser_take_screenshot`) to confirm:
- Camp stopovers render as orange anchor icons (not circles).
- The current-location marker renders as a green van icon inside the pulsing ring.
- Clicking a camp in the side panel shows the orange halo behind its anchor icon (no left-over box-shadow-circle artifact).
- Clicking the current-location entry shows the halo behind the van icon.
- Popups still open on hover/click as before (unrelated to this change, but confirms `bindMarkerInteractions` wasn't broken).

- [ ] **Step 3: Stop the server**

Run: `kill %1` or terminate the background `http.server` process started in Step 1.

No commit for this task — it's verification only, not a code change.
