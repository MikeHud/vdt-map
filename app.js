const GPX_FILE = "track-main.GPX";
const ROUTE_COLOR = "#3a6ea5";

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

setupPanelToggle();
