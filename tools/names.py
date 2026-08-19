# -*- coding: utf-8 -*-
"""English / Simplified / Traditional name resolution for the published data.

English names come from the research dataset's own name_en field wherever it has
one; Chinese stations it leaves blank fall back to Hanyu Pinyin. Line names are
hand-curated for Japan and South Korea (small fixed sets) and pinyin + a
suffix dictionary for China.

Simplified/Traditional are real deterministic OpenCC script conversions and are
only produced for China/Taiwan records - running a Chinese script converter over
Japanese kanji or Korean hangul would silently corrupt those names. Nothing here
invents a translation: when no confident name exists the field is left None and
the site falls back to the local name alone.
"""
import json, os
from opencc import OpenCC
from pypinyin import lazy_pinyin, Style

_s2t, _t2s = OpenCC("s2t"), OpenCC("t2s")


def pinyin_name(s):
    # matches the dataset's own convention (e.g. "Guangzhounan"): syllables joined
    # lowercase with a single leading capital, not per-syllable Capitalisation.
    j = "".join(lazy_pinyin(s, style=Style.NORMAL))
    return j[:1].upper() + j[1:]


def zh_variants(name, country):
    """-> (hans, hant); (None, None) outside the Chinese-script economies."""
    if not name or country not in ("China", "Taiwan"):
        return None, None
    return _t2s.convert(name), _s2t.convert(name)


def load_station_en(src_dir):
    """station name -> English, sourced from affordability_stations.geojson."""
    p = os.path.join(src_dir, "affordability_stations.geojson")
    d = json.load(open(p, encoding="utf-8"))
    m = {}
    for f in d["features"]:
        q = f["properties"]
        name, en, country = q.get("name"), q.get("name_en"), q.get("country")
        if en and en != name:
            m[(country, name)] = en
        elif country == "China" and name:
            m[(country, name)] = pinyin_name(name)
    m[("South Korea", "진부(오대산)")] = "Jinbu (Odaesan)"
    m[("South Korea", "김천구미")] = "Gimcheon-Gumi"
    m[("South Korea", "여수EXPO")] = "Yeosu Expo"
    m[("Japan", "小倉 (福岡県)")] = "Kokura (Fukuoka)"
    return m


LINE_EN = {
    "東海道新幹線": "Tokaido Shinkansen", "山陽新幹線": "Sanyo Shinkansen",
    "東北新幹線": "Tohoku Shinkansen", "上越新幹線": "Joetsu Shinkansen",
    "北陸新幹線": "Hokuriku Shinkansen", "九州新幹線": "Kyushu Shinkansen",
    "北海道新幹線": "Hokkaido Shinkansen", "秋田新幹線": "Akita Shinkansen",
    "山形新幹線": "Yamagata Shinkansen", "西九州新幹線": "Nishi-Kyushu Shinkansen",
    "경부고속선": "Gyeongbu HSL", "호남고속선": "Honam HSL",
    "수서평택고속선": "Suseo-Pyeongtaek HSL", "경부선": "Gyeongbu Line",
    "경부선북": "Gyeongbu Line (North)", "호남선": "Honam Line",
    "전라선": "Jeolla Line", "경전선": "Gyeongjeon Line", "동해선": "Donghae Line",
    "중앙선": "Jungang Line", "강릉선": "Gangneung Line", "경강선": "Gyeonggang Line",
    "대구선": "Daegu Line", "대전선": "Daejeon Line",
    "중부내륙선": "Jungbu Naeryuk Line", "서울청량리연결선": "Seoul-Cheongnyangni Connector",
    "평택연결선": "Pyeongtaek Connector", "용산광명선": "Yongsan-Gwangmyeong Line",
    "서대구지선": "Seodaegu Branch",
    "THSR": "THSR", "Whoosh": "Whoosh", "KTMB ETS": "KTMB ETS",
}
_CN_SUFFIX = [("高速铁路", "High-Speed Railway"), ("城际铁路", "Intercity Railway"),
              ("客运专线", "Passenger Line"), ("联络线", "Connector Line"),
              ("环线", "Loop Line"), ("支线", "Branch Line"),
              ("铁路", "Railway"), ("线", "Line")]


def line_en(country, name):
    if not name:
        return None
    if name in LINE_EN:
        return LINE_EN[name]
    if country == "China":
        for zh, en in _CN_SUFFIX:
            if name.endswith(zh):
                return pinyin_name(name[:-len(zh)]) + " " + en
        return pinyin_name(name)
    return None
