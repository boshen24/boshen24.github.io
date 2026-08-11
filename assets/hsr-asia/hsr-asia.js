(function () {
"use strict";
const DATA = "assets/hsr-asia/data/";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
const TILE_ATTR  = '&copy; OSM &copy; CARTO';

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
function fmtUsd(v){ return v == null ? "—" : "$" + Number(v).toLocaleString("en-US",{maximumFractionDigits:0}); }

const maps = {};
function makeMap(key) {
  const map = L.map("map-" + key, { preferCanvas: true }).setView([20, 112], 4);
  L.tileLayer(TILE_LIGHT, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
  maps[key] = map;
  return map;
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
function gradientLegend(title, stops, tickValues, tickFmt, note) {
  const vmin = stops[0][0], vmax = stops[stops.length - 1][0];
  const pct = v => ((v - vmin) / (vmax - vmin) * 100).toFixed(1) + "%";
  const grad = `linear-gradient(to right, ${stops.map(s => `${s[1]} ${pct(s[0])}`).join(",")})`;
  const ticks = tickValues.map(v => `<span style="position:absolute;left:${pct(v)};transform:translateX(-50%)">${tickFmt(v)}</span>`).join("");
  const rows = `<div class="grad-bar" style="background:${grad}"></div>
    <div class="grad-ticks" style="position:relative;height:1.1em;">${ticks}</div>`;
  return `<h4>${title}</h4>${rows}${note ? `<div class="note">${note}</div>` : ""}`;
}

// ---------------- tabs / lazy init ----------------
const initFns = { density: initDensity, fare: initFare, afford: initAfford };
const done = {};
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
  const BINS = [100, 200, 300];
  const COLORS = ["#e6b13a", "#ea580b", "#c8312c", "#4a0820"];
  const LABELS = ["< 100", "100 – 200", "200 – 300", "≥ 300"];
  function colorT(v) { let i = 0; while (i < BINS.length && v >= BINS[i]) i++; return COLORS[i]; }

  fetch(DATA + "intl_train_density.geojson").then(r => r.json()).then(gj => {
    gj.features.sort((a, b) => (a.properties.daily_trains || 0) - (b.properties.daily_trains || 0));
    const layer = L.geoJSON(gj, {
      style: f => ({ color: colorT(f.properties.daily_trains || 0), weight: 2.4, opacity: 0.92, lineCap: "round" }),
      onEachFeature: (f, l) => {
        l.bindTooltip(`${(f.properties.daily_trains || 0).toFixed(1)} trains/day`, { sticky: true });
        l.on("mouseover", e => e.target.setStyle({ weight: 5 }));
        l.on("mouseout", e => e.target.setStyle({ weight: 2.4 }));
      }
    }).addTo(map);
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
  });

  fetch(DATA + "intl_station_stops.geojson").then(r => r.json()).then(gj => {
    const stopR = z => z < 8 ? 0 : Math.min(12, 2 + 1.6 * (z - 8));
    const layer = L.geoJSON(gj, {
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: stopR(map.getZoom()), color: "#8a8f98", weight: 1.1, fillColor: "#fff", fillOpacity: 0.95 }),
      onEachFeature: (f, l) => l.bindTooltip(f.properties.name || "", { direction: "top" })
    }).addTo(map);
    map.on("zoomend", () => { const r = stopR(map.getZoom()); layer.eachLayer(l => l.setRadius(r)); });
  });

  const rows = COLORS.map((c, i) => `<div class="legend-row"><div class="legend-swatch" style="background:${c}"></div><span>${LABELS[i]}</span></div>`).join("");
  legendControl(`<h4>Trains / day</h4>${rows}<div class="note">Colour = combined daily service count on each track section, merged across parallel/overlapping routes.</div>`).addTo(map);
}

// ================= Fare (Fig 3) =================
function initFare() {
  const map = makeMap("fare");
  const RAMP = [[0.030,"#1a9850"],[0.060,"#66bd63"],[0.110,"#fee08b"],[0.150,"#fc8d59"],
                [0.185,"#fc4e2a"],[0.220,"#e31a1c"],[0.260,"#b10026"],[0.300,"#67001f"]];
  const SYM = { KRW: "₩", TWD: "NT$", MYR: "RM", IDR: "Rp", CNY: "¥", JPY: "¥" };
  const HSFILE = { "South Korea": "south_korea", "Taiwan": "taiwan", "Indonesia": "indonesia", "Malaysia": "malaysia" };

  fetch(DATA + "gdp_per_capita_admin1.geojson").then(r => r.json()).then(gj => {
    const GDP_STOPS = [[0,"#67000d"],[10000,"#ef3b2c"],[20000,"#fc9272"],[30000,"#fdd0bd"],[40000,"#fff5f0"],[50000,"#08306b"]];
    L.geoJSON(gj, {
      interactive: false,
      style: f => ({ fillColor: rampColor(GDP_STOPS, f.properties.gdp_usd), fillOpacity: 0.12, color: "#cccccc", weight: 0.3, opacity: 0.4 })
    }).addTo(map).bringToBack();
  });

  Object.keys(HSFILE).forEach(c => {
    fetch(`${DATA}${HSFILE[c]}_railway_high_speed_lines.geojson`).then(r => r.json()).then(gj => {
      L.geoJSON(gj, { interactive: false, style: { color: "#9aa3ad", weight: 1.2, opacity: 0.55 } }).addTo(map).bringToBack();
    }).catch(() => {});
    fetch(`${DATA}${HSFILE[c]}_railway_high_speed_stations.geojson`).then(r => r.json()).then(gj => {
      L.geoJSON(gj, { pointToLayer: (f, ll) => {
        const m = L.circleMarker(ll, { radius: 3, color: "#8a8f98", fillColor: "#fff", fillOpacity: 0.9, weight: 1 });
        m.bindTooltip(f.properties.name_zh || f.properties.name_en || f.properties.name || "", { direction: "top" });
        return m;
      }}).addTo(map);
    }).catch(() => {});
  });

  fetch(DATA + "fare_segments_all.geojson").then(r => r.json()).then(gj => {
    gj.features.sort((a, b) => (a.properties.usd_per_km || 0) - (b.properties.usd_per_km || 0));
    const layer = L.geoJSON(gj, {
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
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
  });

  legendControl(gradientLegend("Fare (US$ / km)", RAMP, [0.03, 0.15, 0.30], v => "$" + v.toFixed(2),
    "Colour = each priced segment's fare per kilometre, in US dollars. Click a line for its local-currency fare.")).addTo(map);
}

// ================= Affordability (Fig 4) =================
function initAfford() {
  const map = makeMap("afford");
  const RAMP = [[0.12,"#0e7a38"],[0.39,"#46ad52"],[0.66,"#f2c200"],[0.93,"#ef7d2e"],[1.20,"#c81e24"]];

  fetch(DATA + "gdp_per_capita_admin1.geojson").then(r => r.json()).then(gj => {
    const GDP_STOPS = [[0,"#67000d"],[10000,"#ef3b2c"],[20000,"#fc9272"],[30000,"#fdd0bd"],[40000,"#fff5f0"],[50000,"#08306b"]];
    L.geoJSON(gj, {
      interactive: false,
      style: f => ({ fillColor: rampColor(GDP_STOPS, f.properties.gdp_usd), fillOpacity: 0.12, color: "#cccccc", weight: 0.3, opacity: 0.4 })
    }).addTo(map).bringToBack();
  });

  fetch(DATA + "affordability_gradient.geojson").then(r => r.json()).then(gj => {
    const layer = L.geoJSON(gj, {
      interactive: false,
      style: f => ({ color: rampColor(RAMP, f.properties.afford_pct), weight: 3, opacity: 0.95, lineCap: "round" })
    }).addTo(map);
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
  });

  fetch(DATA + "affordability_stations.geojson").then(r => r.json()).then(gj => {
    L.geoJSON(gj, {
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3.2, color: "#333", weight: 1, fillColor: "#fff", fillOpacity: 1 }),
      onEachFeature: (feat, lyr) => {
        const p = feat.properties;
        const segs = (p.segments || []).slice().sort((a, b) => b.afford_pct - a.afford_pct)
          .map(s => `<div class="row"><span>${s.line || ""}</span><span class="v" style="color:${rampColor(RAMP, s.afford_pct)}">${s.afford_pct.toFixed(3)}%</span></div>`).join("");
        lyr.bindPopup(`<div class="pt">${p.name_zh || p.name || ""} <span style="font-weight:400;color:var(--ink-faint)">${p.name_en || ""}</span></div>
          <div class="row"><span>${p.country}</span><span class="v">${p.region || "—"}</span></div>
          <div class="row"><span>GDP / capita</span><span class="v">${fmtUsd(p.gdp_usd)}</span></div>
          <div class="blk">${segs || '<div class="meth">no priced segment</div>'}</div>`);
        lyr.on("mouseover", e => e.target.setRadius(6));
        lyr.on("mouseout", e => e.target.setRadius(3.2));
      }
    }).addTo(map);
  });

  legendControl(gradientLegend("Affordability", RAMP, [0.3, 0.7, 1.0], v => v.toFixed(1) + "%",
    "Cost of a 100 km trip as % of local monthly GDP per capita — lower is more affordable. Click a station for its GDP and every through-segment.")).addTo(map);
}
})();
