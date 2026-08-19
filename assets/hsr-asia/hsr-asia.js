(function () {
"use strict";
const DATA = "assets/hsr-asia/data/";
const MAIN_BOUNDS = [[16.0, 84.0], [48.2, 146.0]];
const BG_CMAP = ["#eef3f7", "#dae7f1", "#c2d8ea", "#a3c4e0", "#7dabd2", "#5990c2"];
const LAND_FILL = "#e9edf1", LAND_LINE = "#9aa3ae", BG_LINE = "#c2ccd6";

function hx(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
function rampColor(ramp, v) {
  if (v == null || isNaN(v)) return "#9aa3ad";
  if (v <= ramp[0][0]) return ramp[0][1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (v <= ramp[i+1][0]) {
      const t = (v - ramp[i][0]) / (ramp[i+1][0] - ramp[i][0]);
      const a = hx(ramp[i][1]), b = hx(ramp[i+1][1]);
      return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;
    }
  }
  return ramp[ramp.length - 1][1];
}
function cmapRamp(colors, vmin, vmax) {
  return colors.map((c, i) => [vmin + (i / (colors.length - 1)) * (vmax - vmin), c]);
}
function cmapColor(colors, vmin, vmax, v, log) {
  if (v == null || isNaN(v) || v <= 0) return LAND_FILL;
  const x = log ? Math.log(v) : v;
  const x0 = log ? Math.log(vmin) : vmin, x1 = log ? Math.log(vmax) : vmax;
  const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return rampColor(cmapRamp(colors, 0, 1), t);
}
// ================= currency & language selectors =================
const CURRENCIES = [
  { code: "USD", label: "USD" },
  { code: "LOCAL", label: "Local" },
  { code: "CNY", label: "CNY" },
  { code: "TWD", label: "TWD" },
  { code: "KRW", label: "KRW" },
  { code: "JPY", label: "JPY" },
  { code: "MYR", label: "MYR" },
  { code: "IDR", label: "IDR" },
];
// Units of currency per 1 USD, 2025-12-31 US Treasury basis (same rates the paper itself uses).
const RATES = { USD: 1, KRW: 1444, TWD: 31.3, MYR: 4.06, IDR: 16650, CNY: 7.00, JPY: 156.6 };
const CSYM = { USD: "$", KRW: "₩", TWD: "NT$", MYR: "RM", IDR: "Rp", CNY: "¥", JPY: "¥" };
const selectedCurrencies = new Set(["USD", "LOCAL"]);

function fmtAmount(code, v) {
  const decimals = v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : 3;
  return (CSYM[code] || "") + v.toLocaleString("en-US", { maximumFractionDigits: decimals });
}
// One row per selected currency, deduped when "Local" resolves to an explicitly-picked code too.
function currencyRows(p) {
  const seen = new Set();
  const rows = [];
  CURRENCIES.forEach(c => {
    if (!selectedCurrencies.has(c.code)) return;
    const code = c.code === "LOCAL" ? p.currency : c.code;
    if (!code || seen.has(code)) return;
    seen.add(code);
    const amount = (code === p.currency && p.local_per_km != null) ? p.local_per_km : (p.usd_per_km || 0) * (RATES[code] || 1);
    rows.push({ label: c.code === "LOCAL" ? "Local" : code, text: fmtAmount(code, amount) + "/km" });
  });
  return rows;
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "local", label: "Local" },
  { code: "hans", label: "简体" },
  { code: "hant", label: "繁體" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
];
const selectedLangs = new Set(["en", "local"]);

// Renders every selected language actually available for this record — never fabricates
// a translation. hans/hant only exist for China/Taiwan (Simplified/Traditional Chinese are
// real deterministic script conversions); ko/ja just surface the native name when the
// record's own country matches — there is no live translation into Korean or Japanese.
function nameVariants(rec) {
  const seen = new Set();
  const out = [];
  const push = s => { if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
  if (selectedLangs.has("en") && rec.en) push(rec.en);
  if (selectedLangs.has("local") && rec.local) push(rec.local);
  if (selectedLangs.has("hans") && rec.hans) push(rec.hans);
  if (selectedLangs.has("hant") && rec.hant) push(rec.hant);
  if (selectedLangs.has("ko") && rec.country === "South Korea" && rec.local) push(rec.local);
  if (selectedLangs.has("ja") && rec.country === "Japan" && rec.local) push(rec.local);
  return out.length ? out.join(" / ") : (rec.local || rec.en || "");
}

let currentRail = null;
function refreshTooltips() {
  if (currentRail) setRail(currentRail);
  if (lastStation && searchMarker) {
    searchMarker.setPopupContent(`<div class="pt">${nameVariants(lastStation)}</div><div class="row"><span>${lastStation.country}</span></div>`);
  }
}
// Always-visible toggle chips (no dropdown) — click a chip to add/remove it
// from the selection; at least one stays selected at all times.
function wireChipGroup(containerId, options, selectedSet, onChange) {
  const container = document.getElementById(containerId);
  container.innerHTML = options.map(o =>
    `<button type="button" class="chip${selectedSet.has(o.code) ? " active" : ""}" data-code="${o.code}">${o.label}</button>`
  ).join("");
  container.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const code = chip.dataset.code;
    if (selectedSet.has(code)) {
      if (selectedSet.size === 1) return; // keep at least one selected
      selectedSet.delete(code);
      chip.classList.remove("active");
    } else {
      selectedSet.add(code);
      chip.classList.add("active");
    }
    onChange();
  });
}

const cache = {};
function cachedFetch(name) {
  if (!cache[name]) cache[name] = fetch(DATA + name).then(r => r.json());
  return cache[name];
}

// ================= map + land base =================
const map = L.map("map", { preferCanvas: true, minZoom: 3, maxZoom: 12, attributionControl: false });
map.fitBounds(MAIN_BOUNDS);
requestAnimationFrame(() => map.invalidateSize());
setTimeout(() => map.invalidateSize(), 150);
window.addEventListener("load", () => map.invalidateSize());
L.control.attribution({ prefix: false })
  .addAttribution("Land: Natural Earth")
  .addAttribution("Rail network: OpenStreetMap contributors")
  .addTo(map);

cachedFetch("land.geojson").then(gj => {
  L.geoJSON(gj, { interactive: false, style: { fillColor: LAND_FILL, fillOpacity: 1, color: LAND_LINE, weight: 0.6 } })
    .addTo(map).bringToBack();
});

// ================= background layer (Population density / GDP per capita) =================
const BG_VARS = {
  pop: { field: "pop_density", vmin: 8.8, vmax: 8050, log: true, label: "Population density (/km², log)",
         ticks: [10, 100, 1000], fmt: v => v >= 1000 ? (v/1000)+"k" : String(v),
         source: "National censuses &amp; statistical offices, 2024." },
  gdp: { field: "gdp_usd", vmin: 4340, vmax: 43381, log: false, label: "GDP per capita (US$)",
         ticks: [5000, 20000, 40000], fmt: v => "$" + Math.round(v/1000) + "k",
         source: "National/subnational GDP accounts, 2024 (current US$)." },
};
let bgLayer = null;
function setBackground(key) {
  const v = BG_VARS[key];
  cachedFetch("gdp_per_capita_admin1.geojson").then(gj => {
    if (bgLayer) map.removeLayer(bgLayer);
    bgLayer = L.geoJSON(gj, {
      interactive: false,
      style: f => {
        const val = f.properties[v.field];
        return { fillColor: val ? cmapColor(BG_CMAP, v.vmin, v.vmax, val, v.log) : LAND_FILL,
                 fillOpacity: 1, color: BG_LINE, weight: 0.4 };
      }
    }).addTo(map);
    if (railLayer) railLayer.bringToFront();
    if (stationLayer) stationLayer.bringToFront();
  });
  bgLegendCtl.update(gradientLegend(v.label, cmapRamp(BG_CMAP, v.vmin, v.vmax), v.ticks, v.fmt, null, v.source));
}

// ================= legend controls =================
function legendControl(opts) {
  const ctl = L.control(opts);
  let el = null;
  ctl.onAdd = function () {
    el = L.DomUtil.create("div", "legend leaflet-control");
    L.DomEvent.disableClickPropagation(el);
    return el;
  };
  ctl.update = function (html) { if (el) el.innerHTML = html; };
  return ctl;
}
function gradientLegend(title, stops, tickValues, tickFmt, ends, note) {
  const vmin = stops[0][0], vmax = stops[stops.length - 1][0];
  const pct = v => ((v - vmin) / (vmax - vmin) * 100).toFixed(1) + "%";
  const grad = `linear-gradient(to right, ${stops.map(s => `${s[1]} ${pct(s[0])}`).join(",")})`;
  const ticks = tickValues.map(v => `<span style="position:absolute;left:${pct(v)};transform:translateX(-50%)">${tickFmt(v)}</span>`).join("");
  const endRow = ends ? `<div class="grad-ends"><em>${ends[0]}</em><em>${ends[1]}</em></div>` : "";
  const rows = `<div class="grad-bar" style="background:${grad}"></div>
    <div class="grad-ticks" style="position:relative;height:1.1em;">${ticks}</div>${endRow}`;
  return `<h4>${title}</h4>${rows}${note ? `<div class="note">${note}</div>` : ""}`;
}
function discreteLegend(title, colors, labels, note) {
  const rows = colors.map((c, i) => `<div class="legend-row"><div class="legend-swatch" style="background:${c}"></div><span>${labels[i]}</span></div>`).join("");
  return `<h4>${title}</h4>${rows}${note ? `<div class="note">${note}</div>` : ""}`;
}
const bgLegendCtl = legendControl({ position: "bottomleft" }).addTo(map);
const railLegendCtl = legendControl({ position: "bottomright" }).addTo(map);

// ================= rail network layer (Plain / Service density / Fare / Affordability) =================
// Both counts are BIDIRECTIONAL (each direction is its own train code, e.g. G1
// and G2), so pairs = count / 2, matching the paper (make_fig1_density.py
// PAIRS_PER_TRAINS = 0.5) over the same [50,100,150] bins.
//   daily_trains — SECTION model: traffic on one physical track, parallel lines
//                  merged. This is what Figure 1 colours by, so it drives colour.
//   path_trains  — PATH model: every routed train passing within 1.5 km,
//                  precomputed by tools/build_site_data.py. This is the number
//                  Figure 1's printed labels use and the only figure the local
//                  explorer lets you read, so it drives the tooltip.
const PAIRS_PER_TRAINS = 0.5;
const DENSITY_BINS = [50, 100, 150];
const DENSITY_COLORS = ["#e6b13a", "#ea580b", "#c8312c", "#4a0820"];
const FARE_RAMP = [[0.030,"#1a9850"],[0.060,"#66bd63"],[0.110,"#fee08b"],[0.150,"#fc8d59"],
                   [0.185,"#fc4e2a"],[0.220,"#e31a1c"],[0.260,"#b10026"],[0.300,"#67001f"]];
const AFFORD_RAMP = [[0.12,"#0e7a38"],[0.39,"#46ad52"],[0.66,"#f2c200"],[0.93,"#ef7d2e"],[1.20,"#c81e24"]];

let railLayer = null, stationLayer = null;
function clearRail() {
  if (railLayer) { map.removeLayer(railLayer); railLayer = null; }
  if (stationLayer) { map.removeLayer(stationLayer); stationLayer = null; }
}

function setRail(key) {
  currentRail = key;
  clearRail();
  if (key === "plain" || key === "density") {
    cachedFetch("intl_train_density.geojson").then(gj => {
      const feats = key === "density"
        ? [...gj.features].sort((a, b) => (a.properties.daily_trains || 0) - (b.properties.daily_trains || 0))
        : gj.features;
      railLayer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
        style: f => {
          if (key === "plain") return { color: "#3a3f45", weight: 2, opacity: 0.85, lineCap: "round" };
          const pairs = (f.properties.daily_trains || 0) * PAIRS_PER_TRAINS;
          let i = 0; while (i < DENSITY_BINS.length && pairs >= DENSITY_BINS[i]) i++;
          return { color: DENSITY_COLORS[i], weight: 2.2, opacity: 0.95, lineCap: "round" };
        },
        onEachFeature: (f, l) => {
          if (key === "density") l.bindTooltip(`${((f.properties.path_trains || 0) * PAIRS_PER_TRAINS).toFixed(1)} train pairs/day`, { sticky: true });
        }
      }).addTo(map);
    });
    cachedFetch("intl_station_stops.geojson").then(gj => {
      const stopR = z => z < 8 ? 0 : Math.min(7, 1.2 + (z - 8));
      stationLayer = L.geoJSON(gj, {
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: stopR(map.getZoom()), color: "#8a8f98", weight: 1, fillColor: "#fff", fillOpacity: 0.95 }),
        onEachFeature: (f, l) => {
          const p = f.properties;
          const name = nameVariants({ en: p.name_en, local: p.name, hans: p.name_hans, hant: p.name_hant, country: p.country });
          l.bindPopup(`<div class="pt">${name}</div>
            <div class="row"><span>${p.country}</span><span class="v">${(p.daily_stops || 0).toFixed(1)} stops/day</span></div>`);
        }
      }).addTo(map);
      map.off("zoomend", zoomStationsHandler);
      map.on("zoomend", zoomStationsHandler);
    });
    railLegendCtl.update(key === "plain"
      ? `<h4>Rail network</h4>`
      : discreteLegend("Train pairs / day", DENSITY_COLORS, ["< 50", "50 – 100", "100 – 150", "≥ 150"]));
  }

  else if (key === "fare") {
    cachedFetch("fare_segments_all.geojson").then(gj => {
      const feats = [...gj.features].sort((a, b) => (a.properties.usd_per_km || 0) - (b.properties.usd_per_km || 0));
      railLayer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
        style: f => ({ color: rampColor(FARE_RAMP, f.properties.usd_per_km), weight: 3, opacity: 0.95, lineCap: "round" }),
        onEachFeature: (f, l) => {
          const p = f.properties;
          const name = nameVariants({ en: p.line_en, local: p.line, hans: p.line_hans, hant: p.line_hant, country: p.country });
          const rows = currencyRows(p).map(r => `<div class="row"><span>${r.label}</span><span class="v">${r.text}</span></div>`).join("");
          l.bindTooltip(`<div class="pt">${name}</div>${rows}`, { sticky: true });
        }
      }).addTo(map);
    });
    railLegendCtl.update(gradientLegend("Unit fare (US$ / km)", FARE_RAMP, [0.05,0.10,0.15,0.20,0.25,0.30], v => v.toFixed(2), ["cheaper", "pricier"]));
  }

  else if (key === "afford") {
    cachedFetch("affordability_gradient.geojson").then(gj => {
      railLayer = L.geoJSON(gj, {
        style: f => ({ color: rampColor(AFFORD_RAMP, f.properties.afford_pct), weight: 3, opacity: 0.95, lineCap: "round" }),
        onEachFeature: (f, l) => {
          l.bindTooltip(`<div class="pt">${(f.properties.afford_pct||0).toFixed(3)}<span class="unit">%</span></div>
            <div class="row"><span>Country</span><span class="v">${f.properties.country || ""}</span></div>`, { sticky: true });
        }
      }).addTo(map);
    });
    railLegendCtl.update(gradientLegend("Affordability", AFFORD_RAMP, [0.3, 0.7, 1.0], v => v.toFixed(1) + "%",
      ["more affordable", "less affordable"]));
  }
}
function zoomStationsHandler() {
  if (!stationLayer) return;
  const stopR = z => z < 8 ? 0 : Math.min(7, 1.2 + (z - 8));
  const r = stopR(map.getZoom());
  stationLayer.eachLayer(l => l.setRadius && l.setRadius(r));
}

// ================= toolbar wiring =================
document.getElementById("bg-picker").addEventListener("click", e => {
  const btn = e.target.closest("button[data-bg]");
  if (!btn) return;
  document.querySelectorAll("#bg-picker button").forEach(b => b.classList.toggle("active", b === btn));
  setBackground(btn.dataset.bg);
});
document.getElementById("rail-picker").addEventListener("click", e => {
  const btn = e.target.closest("button[data-rail]");
  if (!btn) return;
  document.querySelectorAll("#rail-picker button").forEach(b => b.classList.toggle("active", b === btn));
  setRail(btn.dataset.rail);
});

setBackground("pop");
setRail("plain");
wireChipGroup("currency-chips", CURRENCIES, selectedCurrencies, refreshTooltips);
wireChipGroup("language-chips", LANGUAGES, selectedLangs, refreshTooltips);

// ================= station search with autocomplete =================
let SEARCH_INDEX = null;
function loadSearchIndex() {
  if (SEARCH_INDEX) return Promise.resolve(SEARCH_INDEX);
  return cachedFetch("affordability_stations.geojson").then(gj => {
    SEARCH_INDEX = gj.features.map(f => ({
      en: f.properties.name_en || f.properties.name,
      local: f.properties.name,
      hans: f.properties.name_hans,
      hant: f.properties.name_hant,
      country: f.properties.country,
      lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    }));
    return SEARCH_INDEX;
  });
}
const searchInput = document.getElementById("station-search");
const searchResults = document.getElementById("search-results");
let searchMarker = null, lastStation = null;
function renderResults(items) {
  if (!items.length) { searchResults.classList.remove("open"); searchResults.innerHTML = ""; return; }
  searchResults.innerHTML = items.slice(0, 8).map((it, i) =>
    `<div class="search-result" data-i="${i}"><span>${nameVariants(it)}</span><span class="sub">${it.country}</span></div>`
  ).join("");
  searchResults._items = items.slice(0, 8);
  searchResults.classList.add("open");
}
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { renderResults([]); return; }
  loadSearchIndex().then(idx => {
    const matches = idx.filter(it => [it.en, it.local, it.hans, it.hant].some(s => s && s.toLowerCase().includes(q)));
    renderResults(matches);
  });
});
searchResults.addEventListener("click", e => {
  const row = e.target.closest(".search-result");
  if (!row) return;
  const it = searchResults._items[+row.dataset.i];
  goToStation(it);
});
document.addEventListener("click", e => {
  if (!e.target.closest(".search-wrap")) { searchResults.classList.remove("open"); }
});
function goToStation(it) {
  lastStation = it;
  map.setView([it.lat, it.lng], 9);
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.circleMarker([it.lat, it.lng], { radius: 8, color: "#c8312c", weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(map);
  searchMarker.bindPopup(`<div class="pt">${nameVariants(it)}</div><div class="row"><span>${it.country}</span></div>`).openPopup();
  searchInput.value = it.en;
  searchResults.classList.remove("open");
}
})();
