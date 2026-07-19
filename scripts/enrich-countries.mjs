#!/usr/bin/env node
// One-time enrichment: resolves each camp waypoint's country via reverse
// geocoding and appends a "Country: blogUrl" line (after a blank line) to
// its <cmt>, so app.js's popup can show/link to the country's blog posts
// with zero extra data model. <cmt> (not <desc>) is used because that's
// the field Garmin Basecamp's "Comment" box actually edits/round-trips.
//
// Usage:
//   node scripts/enrich-countries.mjs            dry run: geocodes every
//                                                 waypoint (deduped by
//                                                 rounded coords), prints a
//                                                 transition summary, writes
//                                                 scripts/waypoint-countries.json
//                                                 for review (no GPX change)
//   node scripts/enrich-countries.mjs --write     applies
//                                                 waypoint-countries.json to
//                                                 track-main.GPX
//
// Note: geocoding is per-waypoint, not per trip-leg - camps within the same
// numbered leg (e.g. a1.0..a1.9) can straddle a country border, so sampling
// only one point per leg silently mis-tags the rest of that leg.
//
// Edit scripts/waypoint-countries.json by hand between the two runs if any
// waypoint's resolved country looks wrong before applying.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const GPX_PATH = new URL("../track-main.GPX", import.meta.url);
const RESULTS_PATH = new URL("./waypoint-countries.json", import.meta.url);
const BLOG_BASE = "https://vandogtraveller.com/tag/";
const SLUG_OVERRIDES = {
  "united kingdom": "uk",
};
const NOMINATIM_DELAY_MS = 1100; // respect Nominatim's ~1 req/sec usage policy
const COORD_CACHE_PRECISION = 3; // ~110m grid; dedupes near-identical camps

const ALREADY_ENRICHED_RE = /\n\n[^\n:]+:\s*https?:\/\/\S+\s*$/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(country) {
  const key = country.toLowerCase().trim();
  if (SLUG_OVERRIDES[key]) return SLUG_OVERRIDES[key];
  return key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function coordCacheKey(lat, lon) {
  return `${lat.toFixed(COORD_CACHE_PRECISION)},${lon.toFixed(COORD_CACHE_PRECISION)}`;
}

function extractWaypoints(xmlText) {
  const wpts = [];
  const wptRe = /<wpt\b[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/wpt>/g;
  let match;
  while ((match = wptRe.exec(xmlText))) {
    const [full, lat, lon, inner] = match;
    const nameMatch = /<name>([\s\S]*?)<\/name>/.exec(inner);
    const cmtMatch = /<cmt>([\s\S]*?)<\/cmt>/.exec(inner);
    if (!nameMatch || !cmtMatch) continue;
    wpts.push({
      index: match.index,
      fullMatch: full,
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      name: nameMatch[1],
      cmt: cmtMatch[1],
    });
  }
  return wpts;
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=3&accept-language=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "vdt-map-enrich-countries/1.0 (one-time local script)" },
  });
  if (!res.ok) throw new Error(`Nominatim request failed: ${res.status}`);
  const data = await res.json();
  const country = data.address && data.address.country;
  if (!country) throw new Error(`No country in response for ${lat},${lon}`);
  return country;
}

async function dryRun() {
  const xmlText = await readFile(GPX_PATH, "utf8");
  const wpts = extractWaypoints(xmlText);
  console.log(`Found ${wpts.length} waypoints.`);

  const cache = new Map(); // coordCacheKey -> { country, url } | { error }
  const result = {}; // waypoint name -> { country, url, lat, lon }
  let calls = 0;

  for (let i = 0; i < wpts.length; i += 1) {
    const w = wpts[i];
    const cacheKey = coordCacheKey(w.lat, w.lon);
    process.stdout.write(`[${i + 1}/${wpts.length}] ${w.name} -> `);

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      result[w.name] = { ...cached, lat: w.lat, lon: w.lon };
      console.log(`${cached.country || "FAILED"} (cached)`);
      continue;
    }

    calls += 1;
    if (calls > 1) await sleep(NOMINATIM_DELAY_MS);
    try {
      const country = await reverseGeocode(w.lat, w.lon);
      const url = BLOG_BASE + slugify(country);
      const entry = { country, url };
      cache.set(cacheKey, entry);
      result[w.name] = { ...entry, lat: w.lat, lon: w.lon };
      console.log(country);
    } catch (err) {
      const entry = { country: null, url: null, error: String(err) };
      cache.set(cacheKey, entry);
      result[w.name] = { ...entry, lat: w.lat, lon: w.lon };
      console.log(`FAILED (${err.message})`);
    }
  }

  await writeFile(RESULTS_PATH, JSON.stringify(result, null, 2) + "\n");
  console.log(`\nMade ${calls} geocoding calls (${wpts.length - calls} deduped from cache).`);
  console.log(`Wrote ${RESULTS_PATH.pathname}\n`);

  console.log("Country transitions between consecutive waypoints:");
  let prev = null;
  for (const w of wpts) {
    const country = result[w.name].country;
    if (prev !== null && country !== prev.country) {
      console.log(`  ${prev.name} (${prev.country}) -> ${w.name} (${country})`);
    }
    prev = { name: w.name, country };
  }

  console.log(
    "\nReview scripts/waypoint-countries.json (edit any wrong countries/urls), then run with --write to apply."
  );
}

async function apply() {
  if (!existsSync(RESULTS_PATH)) {
    throw new Error("scripts/waypoint-countries.json not found - run without --write first.");
  }
  const results = JSON.parse(await readFile(RESULTS_PATH, "utf8"));
  const xmlText = await readFile(GPX_PATH, "utf8");
  const wpts = extractWaypoints(xmlText);

  let changed = 0;
  let skippedEnriched = 0;
  let skippedNoCountry = 0;
  let output = xmlText;
  // Apply from the end of the string backwards so earlier match indices
  // stay valid as we splice replacements in.
  for (let n = wpts.length - 1; n >= 0; n -= 1) {
    const w = wpts[n];
    if (ALREADY_ENRICHED_RE.test(w.cmt)) {
      skippedEnriched += 1;
      continue;
    }
    const entry = results[w.name];
    if (!entry || !entry.country || !entry.url) {
      skippedNoCountry += 1;
      continue;
    }
    const line = `${entry.country}: ${entry.url}`;
    const newCmt = `${w.cmt}\n\n${escapeXml(line)}`;
    const newFull = w.fullMatch.replace(
      /<cmt>[\s\S]*?<\/cmt>/,
      `<cmt>${newCmt}</cmt>`
    );
    output = output.slice(0, w.index) + newFull + output.slice(w.index + w.fullMatch.length);
    changed += 1;
  }

  await writeFile(GPX_PATH, output);
  console.log(
    `Enriched ${changed} waypoints (skipped ${skippedEnriched} already-enriched, ${skippedNoCountry} with no resolved country).`
  );
}

const write = process.argv.includes("--write");
(write ? apply() : dryRun()).catch((err) => {
  console.error(err);
  process.exit(1);
});
