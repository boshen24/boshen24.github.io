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
function fmtUsd(v){ return v == null ? "—" : "$" + Number(v).toLocaleString("en-US",{maximumFractionDigits:0}); }
// "English (Local)" — falls back to just the local name when no translation exists.
function biName(en, local) { return en && en !== local ? `${en} <span class="local">(${local})</span>` : (en || local || ""); }

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
L.control.attribution({ prefix: false }).addAttribution("Land: Natural Earth").addTo(map);

cachedFetch("land.geojson").then(gj => {
  L.geoJSON(gj, { interactive: false, style: { fillColor: LAND_FILL, fillOpacity: 1, color: LAND_LINE, weight: 0.6 } })
    .addTo(map).bringToBack();
});

// ================= background layer (Population density / GDP per capita) =================
const BG_VARS = {
  pop: { field: "pop_density", vmin: 8.8, vmax: 8050, log: true, label: "Population density (/km², log)",
         ticks: [10, 100, 1000], fmt: v => v >= 1000 ? (v/1000)+"k" : String(v) },
  gdp: { field: "gdp_usd", vmin: 4340, vmax: 43381, log: false, label: "GDP per capita (US$)",
         ticks: [5000, 20000, 40000], fmt: v => "$" + Math.round(v/1000) + "k" },
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
  bgLegendCtl.update(gradientLegend(v.label, cmapRamp(BG_CMAP, v.vmin, v.vmax), v.ticks, v.fmt));
}

// ================= legend controls =================
function legendControl(opts) {
  const ctl = L.control(opts);
  let el = null;
  ctl.onAdd = function () {
    el = L.DomUtil.create("div", "legend");
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
const DENSITY_BINS = [100, 200, 300];
const DENSITY_COLORS = ["#e6b13a", "#ea580b", "#c8312c", "#4a0820"];
const FARE_RAMP = [[0.030,"#1a9850"],[0.060,"#66bd63"],[0.110,"#fee08b"],[0.150,"#fc8d59"],
                   [0.185,"#fc4e2a"],[0.220,"#e31a1c"],[0.260,"#b10026"],[0.300,"#67001f"]];
const AFFORD_RAMP = [[0.12,"#0e7a38"],[0.39,"#46ad52"],[0.66,"#f2c200"],[0.93,"#ef7d2e"],[1.20,"#c81e24"]];
const SYM = { KRW: "₩", TWD: "NT$", MYR: "RM", IDR: "Rp", CNY: "¥", JPY: "¥" };

let railLayer = null, stationLayer = null;
function clearRail() {
  if (railLayer) { map.removeLayer(railLayer); railLayer = null; }
  if (stationLayer) { map.removeLayer(stationLayer); stationLayer = null; }
}

function setRail(key) {
  clearRail();
  if (key === "plain" || key === "density") {
    cachedFetch("intl_train_density.geojson").then(gj => {
      const feats = key === "density"
        ? [...gj.features].sort((a, b) => (a.properties.daily_trains || 0) - (b.properties.daily_trains || 0))
        : gj.features;
      railLayer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
        style: f => {
          if (key === "plain") return { color: "#3a3f45", weight: 2, opacity: 0.85, lineCap: "round" };
          let i = 0; while (i < DENSITY_BINS.length && (f.properties.daily_trains || 0) >= DENSITY_BINS[i]) i++;
          return { color: DENSITY_COLORS[i], weight: 2.2, opacity: 0.95, lineCap: "round" };
        },
        onEachFeature: (f, l) => {
          if (key === "density") l.bindTooltip(`${(f.properties.daily_trains || 0).toFixed(1)} trains/day`, { sticky: true });
          l.on("mouseover", e => e.target.setStyle({ weight: key === "plain" ? 3.5 : 4.5 }));
          l.on("mouseout", e => e.target.setStyle({ weight: key === "plain" ? 2 : 2.2 }));
        }
      }).addTo(map);
    });
    cachedFetch("intl_station_stops.geojson").then(gj => {
      const stopR = z => z < 8 ? 0 : Math.min(12, 2 + 1.6 * (z - 8));
      stationLayer = L.geoJSON(gj, {
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: stopR(map.getZoom()), color: "#8a8f98", weight: 1.1, fillColor: "#fff", fillOpacity: 0.95 }),
        onEachFeature: (f, l) => {
          const en = f.properties.name_en, local = f.properties.name;
          l.bindTooltip(en && en !== local ? `${en} (${local})` : (en || local || ""), { direction: "top" });
        }
      }).addTo(map);
      map.off("zoomend", zoomStationsHandler);
      map.on("zoomend", zoomStationsHandler);
    });
    railLegendCtl.update(key === "plain"
      ? `<h4>Rail network</h4><div class="note">All high-speed rail sections across the eight economies, with no metric overlaid.</div>`
      : discreteLegend("Trains / day", DENSITY_COLORS, ["< 100", "100 – 200", "200 – 300", "≥ 300"],
          "Combined daily service count on each track section, merged across parallel/overlapping routes."));
  }

  else if (key === "fare") {
    cachedFetch("fare_segments_all.geojson").then(gj => {
      const feats = [...gj.features].sort((a, b) => (a.properties.usd_per_km || 0) - (b.properties.usd_per_km || 0));
      railLayer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
        style: f => ({ color: rampColor(FARE_RAMP, f.properties.usd_per_km), weight: 3, opacity: 0.95, lineCap: "round" }),
        onEachFeature: (f, l) => {
          const p = f.properties;
          const money = (v, cur) => v == null ? "—" : (SYM[cur] || "") + Number(v).toLocaleString("en-US");
          const dist = p.dist_km != null ? `${p.dist_km} km` : "full line";
          const html = `<div class="pt">${biName(p.from_en, p.from)} → ${biName(p.to_en, p.to)}</div>
            <div class="row"><span>Line</span><span class="v">${p.country} · ${biName(p.line_en, p.line)}</span></div>
            <div class="row"><span>Distance</span><span class="v">${dist}</span></div>
            <div class="blk"><div class="row"><span class="v">Fare</span><span class="v">${money(p.fare_local, p.currency)}</span></div>
            <div class="row"><span class="meth">USD / km</span><span class="meth">$${(p.usd_per_km||0).toFixed(3)}</span></div></div>`;
          l.bindPopup(html);
          l.on("mouseover", e => e.target.setStyle({ weight: 6 }));
          l.on("mouseout", e => e.target.setStyle({ weight: 3 }));
        }
      }).addTo(map);
    });
    railLegendCtl.update(gradientLegend("Fare (US$ / km)", FARE_RAMP, [0.05,0.10,0.15,0.20,0.25,0.30], v => v.toFixed(2), ["cheaper", "pricier"]));
  }

  else if (key === "afford") {
    cachedFetch("affordability_gradient.geojson").then(gj => {
      railLayer = L.geoJSON(gj, {
        interactive: false,
        style: f => ({ color: rampColor(AFFORD_RAMP, f.properties.afford_pct), weight: 3, opacity: 0.95, lineCap: "round" })
      }).addTo(map);
    });
    cachedFetch("affordability_stations.geojson").then(gj => {
      stationLayer = L.geoJSON(gj, {
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3.2, color: "#333", weight: 1, fillColor: "#fff", fillOpacity: 1 }),
        onEachFeature: (feat, lyr) => {
          const p = feat.properties;
          const segs = (p.segments || []).slice().sort((a, b) => b.afford_pct - a.afford_pct)
            .map(s => `<div class="row"><span>${biName(s.line_en, s.line) || ""}</span><span class="v" style="color:${rampColor(AFFORD_RAMP, s.afford_pct)}">${s.afford_pct.toFixed(3)}%</span></div>`).join("");
          lyr.bindPopup(`<div class="pt">${biName(p.name_en, p.name)}</div>
            <div class="row"><span>${p.country}</span><span class="v">${p.region || "—"}</span></div>
            <div class="row"><span>GDP / capita</span><span class="v">${fmtUsd(p.gdp_usd)}</span></div>
            <div class="blk">${segs || '<div class="meth">no priced segment</div>'}</div>`);
          lyr.on("mouseover", e => e.target.setRadius(6));
          lyr.on("mouseout", e => e.target.setRadius(3.2));
        }
      }).addTo(map);
    });
    railLegendCtl.update(gradientLegend("Affordability", AFFORD_RAMP, [0.3, 0.7, 1.0], v => v.toFixed(1) + "%",
      ["more affordable", "less affordable"], "Cost of a 100 km trip as % of local monthly GDP per capita."));
  }
}
function zoomStationsHandler() {
  if (!stationLayer) return;
  const stopR = z => z < 8 ? 0 : Math.min(12, 2 + 1.6 * (z - 8));
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

// ================= station search with autocomplete =================
let SEARCH_INDEX = null;
function loadSearchIndex() {
  if (SEARCH_INDEX) return Promise.resolve(SEARCH_INDEX);
  return cachedFetch("affordability_stations.geojson").then(gj => {
    SEARCH_INDEX = gj.features.map(f => ({
      en: f.properties.name_en || f.properties.name,
      local: f.properties.name,
      country: f.properties.country,
      lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    }));
    return SEARCH_INDEX;
  });
}
const searchInput = document.getElementById("station-search");
const searchResults = document.getElementById("search-results");
let searchMarker = null;
function renderResults(items) {
  if (!items.length) { searchResults.classList.remove("open"); searchResults.innerHTML = ""; return; }
  searchResults.innerHTML = items.slice(0, 8).map((it, i) =>
    `<div class="search-result" data-i="${i}"><span>${it.en}${it.en !== it.local ? ` <span class="sub">(${it.local})</span>` : ""}</span><span class="sub">${it.country}</span></div>`
  ).join("");
  searchResults._items = items.slice(0, 8);
  searchResults.classList.add("open");
}
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { renderResults([]); return; }
  loadSearchIndex().then(idx => {
    const matches = idx.filter(it => it.en.toLowerCase().includes(q) || it.local.toLowerCase().includes(q));
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
  map.setView([it.lat, it.lng], 9);
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.circleMarker([it.lat, it.lng], { radius: 8, color: "#c8312c", weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(map);
  searchMarker.bindPopup(`<div class="pt">${biName(it.en, it.local)}</div><div class="row"><span>${it.country}</span></div>`).openPopup();
  searchInput.value = it.en;
  searchResults.classList.remove("open");
}
})();
