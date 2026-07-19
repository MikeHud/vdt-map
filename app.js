const GPX_FILE = "track-main.GPX";
const ROUTE_COLOR = "#3a6ea5";
const HIGHLIGHT_COLOR = "#d9743a";

const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;

const ANCHOR_ICON_SVG = `
<svg width="20" height="20" viewBox="0 0 426.667 426.667" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path fill="#d9743a" d="M213.333,426.667c-88.508,0-160.516-72.009-160.516-160.516h46.652
      c0,62.788,51.085,113.869,113.869,113.869c62.793,0,113.873-51.081,113.873-113.869h46.643
      C373.85,354.658,301.841,426.667,213.333,426.667z"/>
    <rect x="189.995" y="105.634" fill="#d9743a" width="46.652" height="297.707"/>
    <rect x="144.742" y="147.115" fill="#d9743a" width="137.173" height="46.643"/>
    <path fill="#d9743a" d="M213.333,128.96c-35.55,0-64.482-28.924-64.482-64.482C148.851,28.924,177.783,0,213.333,0
      c35.558,0,64.482,28.924,64.482,64.474C277.815,100.032,248.892,128.96,213.333,128.96z M213.333,46.643
      c-9.835,0-17.835,8-17.835,17.835s8,17.835,17.835,17.835c9.835,0,17.835-8,17.835-17.835S223.168,46.643,213.333,46.643z"/>
    <polygon fill="#d9743a" points="34.334,266.15 76.143,193.732 117.952,266.15"/>
    <polygon fill="#d9743a" points="308.715,266.15 350.524,193.732 392.333,266.15"/>
  </g>
</svg>`.trim();

const VAN_ICON_SVG = `
<svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 14.5V9.5C2 8.7 2.7 8 3.5 8H13l5 3.5V14.5H2Z" fill="#2f9e6e" stroke="#fff" stroke-width="1"/>
  <rect x="2" y="8" width="16" height="6.5" fill="#2f9e6e" stroke="#fff" stroke-width="1"/>
  <rect x="13.2" y="9.7" width="4.3" height="3.2" fill="#cdeee0" stroke="#2f9e6e" stroke-width="0.6"/>
  <circle cx="6.5" cy="15.5" r="1.9" fill="#1f2f2a" stroke="#fff" stroke-width="0.8"/>
  <circle cx="15.5" cy="15.5" r="1.9" fill="#1f2f2a" stroke="#fff" stroke-width="0.8"/>
</svg>`.trim();

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

function fitBoundsPadding() {
  const panel = document.getElementById("panel");
  if (panel && panel.classList.contains("open")) {
    const panelWidth = panel.getBoundingClientRect().width;
    return { paddingTopLeft: [20, 20], paddingBottomRight: [20 + panelWidth, 20] };
  }
  return { padding: [20, 20] };
}

// Pads latLngBounds on its shorter axis so its aspect ratio matches the map
// viewport's usable (post-padding) area, avoiding the large empty margins
// fitBounds otherwise leaves when the data's bounding box shape doesn't
// match the window shape.
function aspectAdjustedBounds(map, latLngBounds, padding) {
  const crs = map.options.crs;
  const sw = crs.project(latLngBounds.getSouthWest());
  const ne = crs.project(latLngBounds.getNorthEast());
  const dataWidth = Math.abs(ne.x - sw.x);
  const dataHeight = Math.abs(sw.y - ne.y);
  if (!dataWidth || !dataHeight) return latLngBounds;

  const size = map.getSize();
  if (!size.x || !size.y) return latLngBounds;
  const [padLeft, padTop] = padding.paddingTopLeft || padding.padding || [0, 0];
  const [padRight, padBottom] = padding.paddingBottomRight || padding.padding || [0, 0];
  const usableWidth = size.x - padLeft - padRight;
  const usableHeight = size.y - padTop - padBottom;
  if (usableWidth <= 0 || usableHeight <= 0) return latLngBounds;
  const containerAspect = usableWidth / usableHeight;
  const dataAspect = dataWidth / dataHeight;

  let padX = 0;
  let padY = 0;
  if (dataAspect < containerAspect) {
    padX = (dataHeight * containerAspect - dataWidth) / 2;
  } else {
    padY = (dataWidth / containerAspect - dataHeight) / 2;
  }

  const minX = Math.min(sw.x, ne.x) - padX;
  const maxX = Math.max(sw.x, ne.x) + padX;
  const minY = Math.min(sw.y, ne.y) - padY;
  const maxY = Math.max(sw.y, ne.y) + padY;

  return L.latLngBounds(
    crs.unproject(L.point(minX, maxY)),
    crs.unproject(L.point(maxX, minY))
  );
}

function parseWaypointDate(name) {
  const match = DATE_RE.exec(name || "");
  if (!match) return null;
  const [, day, month, year] = match;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function text(el, tag) {
  const node = el.querySelector(tag);
  return node ? node.textContent.trim() : "";
}

function parseGpx(xml) {
  const wptNodes = Array.from(xml.querySelectorAll("wpt"));
  const stopovers = wptNodes.map((node) => {
    const name = text(node, "name");
    const note = text(node, "cmt") || text(node, "desc");
    return {
      lat: parseFloat(node.getAttribute("lat")),
      lon: parseFloat(node.getAttribute("lon")),
      name,
      note,
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

function popupHtml(point, isCurrent) {
  const dateLabel = point.date ? formatDate(point.date) : point.name;
  const note = point.note ? `<span class="popup-note">${renderNote(point.note)}</span>` : "";
  const currentTag = isCurrent ? '<span class="popup-current">Current location</span>' : "";
  return `<span class="popup-date">${escapeHtml(dateLabel)}</span>${note}${currentTag}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const URL_RE = /https?:\/\/[^\s<]+/g;

// Escapes note text while turning any bare http(s) URL into a clickable
// link, so notes/waypoint descriptions can just contain a plain URL.
function linkifyText(str) {
  let html = "";
  let lastIndex = 0;
  for (const match of str.matchAll(URL_RE)) {
    html += escapeHtml(str.slice(lastIndex, match.index));
    const url = match[0];
    html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    lastIndex = match.index + url.length;
  }
  html += escapeHtml(str.slice(lastIndex));
  return html;
}

// Waypoint notes may end with a blank line followed by "Country: blogUrl"
// (written by scripts/enrich-countries.mjs). Render that as a "Country
// posts" link on its own line rather than the raw URL.
const NOTE_COUNTRY_RE = /\n\n([^\n:]+):\s*(https?:\/\/\S+)\s*$/;

function renderNote(note) {
  const match = NOTE_COUNTRY_RE.exec(note);
  if (!match) return linkifyText(note);
  const mainText = note.slice(0, match.index);
  const country = match[1].trim();
  const url = match[2];
  const link = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">See ${escapeHtml(country)} posts</a>`;
  return `${linkifyText(mainText)}\n\n${link}`;
}

function bindMarkerInteractions(marker, point, isCurrent, hoverCapable) {
  marker.bindPopup(popupHtml(point, isCurrent));
  if (!hoverCapable) return;

  // Leaflet's default click handler toggles the popup, which fights with
  // hover-to-open on desktop (click right after hover would close it).
  // Rebind click to always open instead of toggling.
  marker.off("click");
  marker.on("click", () => marker.openPopup());

  // Closing on mouseout must be delayed and cancellable: the popup element
  // isn't a DOM child of the marker, so moving the cursor off the marker
  // and onto the popup (e.g. to click a link) fires mouseout before the
  // pointer arrives over the popup. Without the delay the popup closes
  // out from under the cursor and the link can never be clicked.
  let closeTimer = null;
  const cancelClose = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer = setTimeout(() => marker.closePopup(), 200);
  };

  marker.on("mouseover", () => {
    cancelClose();
    marker.openPopup();
  });
  marker.on("mouseout", scheduleClose);
  marker.on("popupopen", (e) => {
    const el = e.popup.getElement();
    el.addEventListener("mouseover", cancelClose);
    el.addEventListener("mouseout", scheduleClose);
  });
}

function buildMap({ stopovers, logs }) {
  const map = L.map("map", { zoomControl: true });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
    detectRetina: true,
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
        html: `<div class="stopover-icon">${ANCHOR_ICON_SVG}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(map);
    point.marker = marker;
    bindMarkerInteractions(marker, point, false, hoverCapable);
  });

  if (currentLocation) {
    const marker = L.marker([currentLocation.lat, currentLocation.lon], {
      icon: L.divIcon({
        className: "",
        html: `<div class="current-location-marker"><div class="pulse-ring"></div><div class="pulse-icon">${VAN_ICON_SVG}</div></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
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
    const padding = fitBoundsPadding();
    const bounds = aspectAdjustedBounds(map, L.latLngBounds(allPoints), padding);
    map.fitBounds(bounds, padding);
  } else {
    map.setView([48, 10], 4);
  }

  return { map, stopovers, logs, currentLocation };
}

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
      li.classList.add("panel-current-entry");
    }
    li.addEventListener("click", () => onSelect(entry));
    entry.listItem = li;
    listEl.appendChild(li);
  });
}

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
    map.fitBounds(L.latLngBounds(entry.coords), {
      ...fitBoundsPadding(),
      maxZoom: map.getZoom(),
    });
  }
}

function selectCamp(entry, map) {
  clearSelection();
  const el = entry.marker.getElement();
  if (el) el.classList.add("panel-selected");
  if (entry.listItem) entry.listItem.classList.add("active");
  selected = { kind: "camp", entry };
  map.panTo([entry.lat, entry.lon]);
  entry.marker.openPopup();
}

function buildPanel({ map, stopovers, logs, currentLocation }) {
  const campsList = document.getElementById("camps-list");
  const logsList = document.getElementById("logs-list");

  renderList(campsList, sortForPanel(stopovers), (entry) => selectCamp(entry, map), currentLocation);
  renderList(logsList, sortForPanel(logs), (entry) => selectLog(entry, map), null);
}

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

setupPanelToggle();
