# -*- coding: utf-8 -*-
"""Build the PUBLIC, display-grade geojson the website ships.

Reads the full research data from HSRAsia/web/data and writes a deliberately
reduced copy into assets/hsr-asia/data:

  * only the properties hsr-asia.js actually renders are kept
  * geometry is Douglas-Peucker simplified (~40 m) and coordinates rounded to
    4 dp (~11 m). At the site's maxZoom of 12 one pixel is ~38 m, so this is
    invisible on screen while leaving the published lines display-grade rather
    than analysis-grade.
  * the routing model (intl_trains.json / intl_train_paths.json, ~36 MB) is read
    at BUILD time to precompute path-model intensity, but is never shipped.

Every METRIC VALUE (daily_trains, path_trains, fares, afford_pct, GDP,
population density) is copied/derived exactly - only geometry precision and
field count are reduced.

    B:/Files/envs/hsrasia/python.exe tools/build_site_data.py
"""
import json, math, os, statistics, sys
from pathlib import Path
from shapely.geometry import shape, mapping

sys.path.insert(0, str(Path(__file__).resolve().parent))
import path_probe
from names import load_station_en, line_en, zh_variants, pinyin_name

SRC = Path(path_probe.D)
DST = Path(__file__).resolve().parents[1] / "assets" / "hsr-asia" / "data"
TOL, PREC = 0.0004, 4
STATION_EN = load_station_en(str(SRC))


def station_en(country, name):
    if (country, name) in STATION_EN:
        return STATION_EN[(country, name)]
    return pinyin_name(name) if country == "China" and name else None


def rnd(c):
    return [round(x, PREC) for x in c] if isinstance(c[0], (int, float)) else [rnd(i) for i in c]


def geom(g, simplify=True):
    if simplify:
        try:
            g = mapping(shape(g).simplify(TOL, preserve_topology=True))
        except Exception:
            pass
    g = dict(g)
    g["coordinates"] = rnd(g["coordinates"])
    return g


def build(fn, fields, simplify=True, enrich=None):
    d = json.loads((SRC / fn).read_text(encoding="utf-8"))
    out = []
    for f in d["features"]:
        p = f["properties"]
        np_ = {k: p[k] for k in fields if k in p}
        if enrich:
            enrich(f, p, np_)
        out.append({"type": "Feature", "properties": np_,
                    "geometry": geom(f["geometry"], simplify)})
    (DST / fn).write_text(json.dumps({"type": "FeatureCollection", "features": out},
                                     ensure_ascii=False, separators=(",", ":")),
                          encoding="utf-8")
    print(f"  {fn:38s} {len(out):6d} feats  {(DST/fn).stat().st_size/1e6:6.2f} MB")


def st_names(f, p, np_):
    c, n = p.get("country"), p.get("name")
    np_["name_en"] = station_en(c, n)
    np_["name_hans"], np_["name_hant"] = zh_variants(n, c)


def fare_names(f, p, np_):
    c, ln = p.get("country"), p.get("line")
    np_["line_en"] = line_en(c, ln)
    np_["line_hans"], np_["line_hant"] = zh_variants(ln, c)


# ---- path-model intensity, precomputed per section -------------------------
# The section model (daily_trains) is what Figure 1 COLOURS by; the paper's
# printed labels instead come from the 1.5 km path probe, which is also the only
# number the local explorer lets you read. Sampling along each section shows the
# probe is constant over 75% of sections, so one representative (the median of
# samples every ~5 km) is faithful. Stored BIDIRECTIONAL, like daily_trains, so
# the front end applies the same /2 pairs conversion to both.
def _cumkm(cs):
    d = [0.0]
    for a, b in zip(cs, cs[1:]):
        la = math.radians((a[1] + b[1]) / 2)
        d.append(d[-1] + math.hypot((b[0]-a[0]) * 111.32 * math.cos(la),
                                    (b[1]-a[1]) * 111.32))
    return d


def _samples(cs, step=5.0, cap=8):
    d = _cumkm(cs); L = d[-1]
    if L < 1e-9:
        return [cs[len(cs) // 2]]
    n = max(1, min(cap, int(L // step) or 1))
    out, j = [], 0
    for k in range(n):
        target = L * (k + 0.5) / n
        while j + 1 < len(d) and d[j+1] < target:
            j += 1
        out.append(cs[j])
    return out


print("building public site data ...")
print("  indexing routing model (build-time only, not shipped) ...")
_paths, _pidw, _grid = path_probe.load()


def density_probe(f, p, np_):
    g = f["geometry"]
    cs = g["coordinates"] if g["type"] == "LineString" else g["coordinates"][0]
    vals = [path_probe.probe(P, _paths, _pidw, _grid) for P in _samples(cs)]
    np_["path_trains"] = round(statistics.median(vals), 2)


build("intl_train_density.geojson",     ["daily_trains"], enrich=density_probe)
build("affordability_gradient.geojson", ["country", "afford_pct"])
build("fare_segments_all.geojson",      ["country", "currency", "line", "local_per_km", "usd_per_km"],
      enrich=fare_names)
build("gdp_per_capita_admin1.geojson",  ["gdp_usd", "pop_density"])
build("intl_station_stops.geojson",     ["country", "name", "daily_stops"], simplify=False, enrich=st_names)
build("affordability_stations.geojson", ["country", "name"], simplify=False, enrich=st_names)
print(f"total: {sum(f.stat().st_size for f in DST.glob('*.geojson'))/1e6:.1f} MB")
