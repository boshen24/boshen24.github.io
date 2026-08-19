# -*- coding: utf-8 -*-
"""Build the PUBLIC, display-grade geojson the website ships.

Reads the full research data from HSRAsia/web/data and writes a deliberately
reduced copy into assets/hsr-asia/data:

  * only the properties hsr-asia.js actually renders are kept
  * geometry is Douglas-Peucker simplified (~40 m) and coordinates rounded to
    4 dp (~11 m). At the site's maxZoom of 12 one pixel is ~38 m, so this is
    invisible on screen while leaving the published lines display-grade rather
    than analysis-grade.
  * the routing model (intl_trains.json / intl_train_paths.json, ~36 MB) is
    never shipped at all.

Every METRIC VALUE (daily_trains, fares, afford_pct, GDP, population density)
is copied through exactly - only geometry precision and field count are reduced.

    B:/Files/envs/hsrasia/python.exe tools/build_site_data.py
"""
import json, os, sys
from pathlib import Path
from shapely.geometry import shape, mapping
from opencc import OpenCC

SRC = Path(r"B:\Files\Work-on Programs\HSRAsia\web\data")
DST = Path(__file__).resolve().parents[1] / "assets" / "hsr-asia" / "data"
SCRATCH = r"B:\PostgreSQL_Temp\claude\B--Files-Work-on-Programs-HSRAsia\1cd5a9ae-cfa3-46d0-8cdb-b9db3ddd17cb\scratchpad"
sys.path.insert(0, SCRATCH)
from add_english_names import station_en, line_en   # guarded by __main__, safe to import

TOL, PREC = 0.0004, 4
_s2t, _t2s = OpenCC("s2t"), OpenCC("t2s")
def zh(name, country):
    """(hans, hant) - only meaningful for Chinese script; None elsewhere."""
    if not name or country not in ("China", "Taiwan"):
        return None, None
    return _t2s.convert(name), _s2t.convert(name)

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
            enrich(p, np_)
        out.append({"type": "Feature", "properties": np_, "geometry": geom(f["geometry"], simplify)})
    (DST / fn).write_text(
        json.dumps({"type": "FeatureCollection", "features": out}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print(f"  {fn:38s} {len(out):6d} feats  {(DST/fn).stat().st_size/1e6:6.2f} MB")

def st_names(p, np_):
    c, n = p.get("country"), p.get("name")
    np_["name_en"] = station_en(c, n)
    np_["name_hans"], np_["name_hant"] = zh(n, c)

def fare_names(p, np_):
    c, ln = p.get("country"), p.get("line")
    np_["line_en"] = line_en(c, ln)
    np_["line_hans"], np_["line_hant"] = zh(ln, c)

print("building public site data ...")
build("intl_train_density.geojson",     ["daily_trains"])
build("affordability_gradient.geojson", ["country", "afford_pct"])
build("fare_segments_all.geojson",      ["country", "currency", "line", "local_per_km", "usd_per_km"],
      enrich=fare_names)
build("gdp_per_capita_admin1.geojson",  ["gdp_usd", "pop_density"])
build("intl_station_stops.geojson",     ["country", "name", "daily_stops"], simplify=False, enrich=st_names)
build("affordability_stations.geojson", ["country", "name"],                simplify=False, enrich=st_names)
print(f"total: {sum(f.stat().st_size for f in DST.glob('*.geojson'))/1e6:.1f} MB")
