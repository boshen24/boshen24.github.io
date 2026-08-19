# -*- coding: utf-8 -*-
"""Cut each density section where its path-model intensity changes.

The path probe is a POINT measure, and on 18.7% of the merged sections its value
varies along the line (median spread 38%, p90 350%), so collapsing a section to
one representative would misreport those. Instead each section is densely
sampled, consecutive samples carrying the same value are grouped into runs, and
one output feature is emitted per run. Hovering anywhere then reports the same
figure a click at that spot gives in the local explorer.
"""
import math

STEP_KM = 1.0          # sampling pitch: each emitted piece carries the exact probe at its own midpoint


def cumkm(cs):
    d = [0.0]
    for a, b in zip(cs, cs[1:]):
        la = math.radians((a[1] + b[1]) / 2)
        d.append(d[-1] + math.hypot((b[0]-a[0]) * 111.32 * math.cos(la),
                                    (b[1]-a[1]) * 111.32))
    return d


def at(cs, d, t):
    """Interpolated [lon,lat] at distance t km along the line."""
    if t <= 0:
        return list(cs[0])
    if t >= d[-1]:
        return list(cs[-1])
    lo, hi = 0, len(d) - 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if d[mid] <= t:
            lo = mid
        else:
            hi = mid
    span = d[lo+1] - d[lo]
    f = 0.0 if span <= 0 else (t - d[lo]) / span
    a, b = cs[lo], cs[lo+1]
    return [a[0] + (b[0]-a[0]) * f, a[1] + (b[1]-a[1]) * f]


def slice_line(cs, d, t0, t1):
    """Vertices of the sub-line from t0..t1 km, with interpolated ends."""
    out = [at(cs, d, t0)]
    for i, di in enumerate(d):
        if t0 < di < t1:
            out.append(list(cs[i]))
    out.append(at(cs, d, t1))
    # drop consecutive duplicates so we never emit a zero-length segment
    ded = [out[0]]
    for p in out[1:]:
        if abs(p[0]-ded[-1][0]) > 1e-9 or abs(p[1]-ded[-1][1]) > 1e-9:
            ded.append(p)
    return ded if len(ded) >= 2 else None


def split(cs, probe_at, step=STEP_KM):
    """-> [(sub_coords, value)] with value constant on each piece."""
    d = cumkm(cs)
    L = d[-1]
    if L < 1e-9:
        return []
    n = max(1, int(round(L / step)))
    # sample at interval MIDPOINTS so every sample represents a real stretch of line
    edges = [L * i / n for i in range(n + 1)]
    vals = [probe_at(at(cs, d, (edges[i] + edges[i+1]) / 2)) for i in range(n)]

    runs, s = [], 0
    for i in range(1, n + 1):
        if i == n or vals[i] != vals[s]:
            sub = slice_line(cs, d, edges[s], edges[i])
            if sub:
                runs.append((sub, vals[s]))
            s = i
    return runs
