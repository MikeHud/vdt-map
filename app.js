const GPX_FILE = "track-main.GPX";
const ROUTE_COLOR = "#3a6ea5";
const HIGHLIGHT_COLOR = "#d9743a";

const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;

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

function popupHtml(point, isCurrent) {
  const dateLabel = point.date ? formatDate(point.date) : point.name;
  const note = point.note ? `<span class="popup-note">${escapeHtml(point.note)}</span>` : "";
  const currentTag = isCurrent ? '<span class="popup-current">Current location</span>' : "";
  return `<span class="popup-date">${escapeHtml(dateLabel)}</span>${note}${currentTag}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function bindMarkerInteractions(marker, point, isCurrent, hoverCapable) {
  marker.bindPopup(popupHtml(point, isCurrent));
  if (hoverCapable) {
    // Leaflet's default click handler toggles the popup, which fights with
    // hover-to-open on desktop (click right after hover would close it).
    // Rebind click to always open instead of toggling.
    marker.off("click");
    marker.on("click", () => marker.openPopup());
    marker.on("mouseover", () => marker.openPopup());
    marker.on("mouseout", () => marker.closePopup());
  }
}

function buildMap({ stopovers, logs }) {
  const map = L.map("map", { zoomControl: true, zoomSnap: 0.25 });

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
