(function () {
"use strict";
const DATA = "assets/hsr-asia/data/";
// Same extent as the paper's own base map (scripts/_fig_base.py MAIN_EXT).
const MAIN_BOUNDS = [[16.0, 84.0], [48.2, 146.0]];
// scripts/_fig_base.py GDP_CMAP — the one background ramp shared by all 3 paper figures.
const BG_CMAP = ["#eef3f7", "#dae7f1", "#c2d8ea", "#a3c4e0", "#7dabd2", "#5990c2"];
const LAND_FILL = "#e9edf1", LAND_LINE = "#9aa3ae";
const BG_LINE = "#c2ccd6";

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
// evenly-interpolated N-stop palette across [vmin,vmax] — mirrors
// matplotlib's LinearSegmentedColormap + Normalize used in the paper scripts.
function cmapRamp(colors, vmin, vmax) {
  return colors.map((c, i) => [vmin + (i / (colors.length - 1)) * (vmax - vmin), c]);
}
function cmapColor(colors, vmin, vmax, v, log) {
  if (v == null || isNaN(v) || v <= 0) return LAND_FILL;
  const x = log ? Math.log(v) : v;
  const x0 = log ? Math.log(vmin) : vmin, x1 = log ? Math.log(vmax) : vmax;
  const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  const ramp = cmapRamp(colors, 0, 1);
  return rampColor(ramp, t);
}
function fmtUsd(v){ return v == null ? "—" : "$" + Number(v).toLocaleString("en-US",{maximumFractionDigits:0}); }

// ---- shared, cached fetches (land + GDP/pop-density background used by all 3 tabs) ----
const cache = {};
function cachedFetch(name) {
  if (!cache[name]) cache[name] = fetch(DATA + name).then(r => r.json());
  return cache[name];
}

function makeMap(key) {
  const map = L.map("map-" + key, { preferCanvas: true, minZoom: 3, maxZoom: 12, attributionControl: false });
  map.fitBounds(MAIN_BOUNDS);
  // the container's flex/absolute layout may not have a measured size yet on
  // the very first tab at DOMContentLoaded time, which leaves Leaflet's canvas
  // renderer sized to 0×0 until something calls invalidateSize().
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 150);
  window.addEventListener("load", () => map.invalidateSize());
  L.control.attribution({ prefix: false }).addAttribution("Land: Natural Earth").addTo(map);
  cachedFetch("land.geojson").then(gj => {
    L.geoJSON(gj, { interactive: false, style: { fillColor: LAND_FILL, fillOpacity: 1, color: LAND_LINE, weight: 0.6 } })
      .addTo(map).bringToBack();
  });
  return map;
}

// value/log/domain shared by the two background variables
const BG_VARS = {
  gdp:  { field: "gdp_usd",     vmin: 4340,  vmax: 43381, log: false, label: "GDP per capita (US$)", ticks: [5000, 20000, 40000], fmt: v => "$" + Math.round(v/1000) + "k" },
  pop:  { field: "pop_density", vmin: 8.8,   vmax: 8050,  log: true,  label: "Population density (/km², log)", ticks: [10, 100, 1000], fmt: v => v >= 1000 ? (v/1000)+"k" : String(v) },
};
function addBackground(map, varKey) {
  const v = BG_VARS[varKey];
  cachedFetch("gdp_per_capita_admin1.geojson").then(gj => {
    L.geoJSON(gj, {
      interactive: false,
      style: f => {
        const val = f.properties[v.field];
        return { fillColor: val ? cmapColor(BG_CMAP, v.vmin, v.vmax, val, v.log) : LAND_FILL,
                 fillOpacity: 1, color: BG_LINE, weight: 0.4 };
      }
    }).addTo(map);
  });
}
function bgLegend(varKey) {
  const v = BG_VARS[varKey];
  return legendControl(gradientLegend(v.label, cmapRamp(BG_CMAP, v.vmin, v.vmax), v.ticks, v.fmt), { position: "bottomleft" });
}

function legendControl(html, opts) {
  const ctl = L.control(Object.assign({ position: "bottomright" }, opts || {}));
  ctl.onAdd = function () {
    const d = L.DomUtil.create("div", "legend");
    d.innerHTML = html;
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
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

// ---------------- tabs / lazy init ----------------
const initFns = { density: initDensity, fare: initFare, afford: initAfford };
const done = {};
const maps = {};
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".mapview").forEach(v => v.classList.toggle("active", v.id === "view-" + key));
    if (!done[key]) { done[key] = true; initFns[key](); }
    else if (maps[key]) { setTimeout(() => maps[key].invalidateSize(), 0); }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  initDensity();
  done.density = true;
});

// ================= Density (Fig 1) =================
function initDensity() {
  const map = makeMap("density");
  maps.density = map;
  addBackground(map, "pop");

  const BINS = [100, 200, 300];
  const COLORS = ["#e6b13a", "#ea580b", "#c8312c", "#4a0820"];
  const LABELS = ["< 100", "100 – 200", "200 – 300", "≥ 300"];
  function colorT(v) { let i = 0; while (i < BINS.length && v >= BINS[i]) i++; return COLORS[i]; }

  cachedFetch("intl_train_density.geojson").then(gj => {
    gj = { type: "FeatureCollection", features: [...gj.features].sort((a, b) => (a.properties.daily_trains || 0) - (b.properties.daily_trains || 0)) };
    L.geoJSON(gj, {
      style: f => ({ color: colorT(f.properties.daily_trains || 0), weight: 2.2, opacity: 0.95, lineCap: "round" }),
      onEachFeature: (f, l) => {
        l.bindTooltip(`${(f.properties.daily_trains || 0).toFixed(1)} trains/day`, { sticky: true });
        l.on("mouseover", e => e.target.setStyle({ weight: 4.5 }));
        l.on("mouseout", e => e.target.setStyle({ weight: 2.2 }));
      }
    }).addTo(map);
  });

  cachedFetch("intl_station_stops.geojson").then(gj => {
    const stopR = z => z < 8 ? 0 : Math.min(12, 2 + 1.6 * (z - 8));
    const layer = L.geoJSON(gj, {
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: stopR(map.getZoom()), color: "#8a8f98", weight: 1.1, fillColor: "#fff", fillOpacity: 0.95 }),
      onEachFeature: (f, l) => l.bindTooltip(f.properties.name || "", { direction: "top" })
    }).addTo(map);
    map.on("zoomend", () => { const r = stopR(map.getZoom()); layer.eachLayer(l => l.setRadius(r)); });
  });

  const rows = COLORS.map((c, i) => `<div class="legend-row"><div class="legend-swatch" style="background:${c}"></div><span>${LABELS[i]}</span></div>`).join("");
  legendControl(`<h4>Trains / day</h4>${rows}<div class="note">Combined daily service count on each track section, merged across parallel/overlapping routes.</div>`).addTo(map);
  bgLegend("pop").addTo(map);
}

// ================= Fare (Fig 3) =================
function initFare() {
  const map = makeMap("fare");
  maps.fare = map;
  addBackground(map, "gdp");

  const RAMP = [[0.030,"#1a9850"],[0.060,"#66bd63"],[0.110,"#fee08b"],[0.150,"#fc8d59"],
                [0.185,"#fc4e2a"],[0.220,"#e31a1c"],[0.260,"#b10026"],[0.300,"#67001f"]];
  const SYM = { KRW: "₩", TWD: "NT$", MYR: "RM", IDR: "Rp", CNY: "¥", JPY: "¥" };

  cachedFetch("fare_segments_all.geojson").then(gj => {
    gj = { type: "FeatureCollection", features: [...gj.features].sort((a, b) => (a.properties.usd_per_km || 0) - (b.properties.usd_per_km || 0)) };
    L.geoJSON(gj, {
      style: f => ({ color: rampColor(RAMP, f.properties.usd_per_km), weight: 3, opacity: 0.95, lineCap: "round" }),
      onEachFeature: (f, l) => {
        const p = f.properties;
        const money = (v, cur) => v == null ? "—" : (SYM[cur] || "") + Number(v).toLocaleString("en-US");
        const dist = p.dist_km != null ? `${p.dist_km} km` : "full line";
        let html = `<div class="pt">${p.from} → ${p.to}</div>
          <div class="row"><span>Line</span><span class="v">${p.country} · ${p.line || ""}</span></div>
          <div class="row"><span>Distance</span><span class="v">${dist}</span></div>
          <div class="blk"><div class="row"><span class="v">Fare</span><span class="v">${money(p.fare_local, p.currency)}</span></div>
          <div class="row"><span class="meth">USD / km</span><span class="meth">$${(p.usd_per_km||0).toFixed(3)}</span></div></div>`;
        l.bindPopup(html);
        l.on("mouseover", e => e.target.setStyle({ weight: 6 }));
        l.on("mouseout", e => e.target.setStyle({ weight: 3 }));
      }
    }).addTo(map);
  });

  legendControl(gradientLegend("Fare (US$ / km)", RAMP, [0.05,0.10,0.15,0.20,0.25,0.30], v => v.toFixed(2),
    ["cheaper", "pricier"])).addTo(map);
  bgLegend("gdp").addTo(map);
}

// ================= Affordability (Fig 4) =================
function initAfford() {
  const map = makeMap("afford");
  maps.afford = map;
  addBackground(map, "gdp");

  const RAMP = [[0.12,"#0e7a38"],[0.39,"#46ad52"],[0.66,"#f2c200"],[0.93,"#ef7d2e"],[1.20,"#c81e24"]];

  cachedFetch("affordability_gradient.geojson").then(gj => {
    L.geoJSON(gj, {
      interactive: false,
      style: f => ({ color: rampColor(RAMP, f.properties.afford_pct), weight: 3, opacity: 0.95, lineCap: "round" })
    }).addTo(map);
  });

  cachedFetch("affordability_stations.geojson").then(gj => {
    L.geoJSON(gj, {
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3.2, color: "#333", weight: 1, fillColor: "#fff", fillOpacity: 1 }),
      onEachFeature: (feat, lyr) => {
        const p = feat.properties;
        const segs = (p.segments || []).slice().sort((a, b) => b.afford_pct - a.afford_pct)
          .map(s => `<div class="row"><span>${s.line || ""}</span><span class="v" style="color:${rampColor(RAMP, s.afford_pct)}">${s.afford_pct.toFixed(3)}%</span></div>`).join("");
        lyr.bindPopup(`<div class="pt">${p.name_zh || p.name || ""} <span style="font-weight:400;color:var(--ink-soft)">${p.name_en || ""}</span></div>
          <div class="row"><span>${p.country}</span><span class="v">${p.region || "—"}</span></div>
          <div class="row"><span>GDP / capita</span><span class="v">${fmtUsd(p.gdp_usd)}</span></div>
          <div class="blk">${segs || '<div class="meth">no priced segment</div>'}</div>`);
        lyr.on("mouseover", e => e.target.setRadius(6));
        lyr.on("mouseout", e => e.target.setRadius(3.2));
      }
    }).addTo(map);
  });

  legendControl(gradientLegend("Affordability", RAMP, [0.3, 0.7, 1.0], v => v.toFixed(1) + "%",
    ["more affordable", "less affordable"],
    "Cost of a 100 km trip as % of local monthly GDP per capita.")).addTo(map);
  bgLegend("gdp").addTo(map);
}
})();
