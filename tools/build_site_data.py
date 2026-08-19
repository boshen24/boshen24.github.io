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
from split_by_probe import split
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


# ---- path-model intensity, precomputed ------------------------------------
# The section model (daily_trains) is what Figure 1 COLOURS by; the paper's
# printed labels and the local explorer's click readout both come from the 1.5 km
# path probe instead. That probe is a POINT measure and varies along 18.7% of the
# merged sections, so rather than collapse a section to one figure we cut it
# wherever the probe changes (tools/split_by_probe.py) and emit one feature per
# constant run. Hovering then reports exactly what clicking that spot reports
# locally. Stored BIDIRECTIONAL, like daily_trains, so the front end applies the
# same /2 pairs conversion to both.
print("  indexing routing model (build-time only, not shipped) ...")
_paths, _pidw, _grid = path_probe.load()


def _probe_at(P):
    return round(path_probe.probe(P, _paths, _pidw, _grid), 2)


def build_density(fn="intl_train_density.geojson"):
    d = json.loads((SRC / fn).read_text(encoding="utf-8"))
    out = []
    for f in d["features"]:
        dt = f["properties"].get("daily_trains")
        for sub, val in split(f["geometry"]["coordinates"], _probe_at):
            out.append({"type": "Feature",
                        "properties": {"daily_trains": dt, "path_trains": val},
                        "geometry": geom({"type": "LineString", "coordinates": sub})})
    (DST / fn).write_text(json.dumps({"type": "FeatureCollection", "features": out},
                                     ensure_ascii=False, separators=(",", ":")),
                          encoding="utf-8")
    print(f"  {fn:38s} {len(d['features']):6d} -> {len(out):6d} feats  "
          f"{(DST/fn).stat().st_size/1e6:6.2f} MB")


build_density()
build("affordability_gradient.geojson", ["country", "afford_pct"])
build("fare_segments_all.geojson",      ["country", "currency", "line", "local_per_km", "usd_per_km"],
      enrich=fare_names)
build("gdp_per_capita_admin1.geojson",  ["gdp_usd", "pop_density"])
build("intl_station_stops.geojson",     ["country", "name", "daily_stops"], simplify=False, enrich=st_names)
build("affordability_stations.geojson", ["country", "name"], simplify=False, enrich=st_names)
print(f"total: {sum(f.stat().st_size for f in DST.glob('*.geojson'))/1e6:.1f} MB")
