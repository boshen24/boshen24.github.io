# -*- coding: utf-8 -*-
"""Faithful port of train_pairs_map.html pointIntensity(): for a point P, sum the
daily weight of every train PATH passing within 1.5 km of P (deduped per path).

This is the aggregation the paper's Figure 1 labels use - distinct from the SECTION
model stored in intl_train_density.geojson. Build-time only: reads intl_trains.json
and intl_train_paths.json (~36 MB) from HSRAsia, neither of which is ever shipped.

Verified against the live local map: probing (113.933, 22.799) and (113.666, 22.863)
reproduces its 196.9 / 221.9 pairs-per-day readouts exactly.
"""
import json, math, os
from collections import defaultdict

D = os.path.join("B:", os.sep, "Files", "Work-on Programs", "HSRAsia", "web", "data")
CELL_DEG, THRESH = 0.1, 1.5


def load():
    """-> (paths, PID_W, grid).  PID_W[pid] = bidirectional trains/day on that path."""
    trains = json.load(open(os.path.join(D, "intl_trains.json"), encoding="utf-8"))
    paths = json.load(open(os.path.join(D, "intl_train_paths.json"), encoding="utf-8"))
    PID_W, PID_N = defaultdict(float), defaultdict(int)
    for code, t in trains.items():
        pid = t.get("path")
        if pid:
            PID_W[pid] += (t.get("weight") or 0)
            PID_N[pid] += 1
    grid = defaultdict(list)
    for pid, cs in paths.items():
        if pid not in PID_N or not cs or len(cs) < 2:
            continue                      # only paths an actual train references
        for i in range(1, len(cs)):
            a, b = cs[i-1], cs[i]
            cx0 = int(math.floor(min(a[0], b[0]) / CELL_DEG))
            cx1 = int(math.floor(max(a[0], b[0]) / CELL_DEG))
            cy0 = int(math.floor(min(a[1], b[1]) / CELL_DEG))
            cy1 = int(math.floor(max(a[1], b[1]) / CELL_DEG))
            for cx in range(cx0, cx1 + 1):
                for cy in range(cy0, cy1 + 1):
                    grid[(cx, cy)].append((pid, i))
    return paths, PID_W, grid


def seg_km(P, A, B):
    """Point-to-segment distance in km, same local-planar approximation as the JS."""
    kx = 111.32 * math.cos(P[1] * math.pi / 180); ky = 111.32
    ax, ay = (A[0]-P[0]) * kx, (A[1]-P[1]) * ky
    bx, by = (B[0]-P[0]) * kx, (B[1]-P[1]) * ky
    dx, dy = bx - ax, by - ay
    L = dx*dx + dy*dy
    t = -(ax*dx + ay*dy) / L if L else 0.0
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return math.hypot(ax + t*dx, ay + t*dy)


def probe(P, paths, PID_W, grid):
    """Bidirectional trains/day whose routed path passes within THRESH km of P."""
    cx0, cy0 = int(math.floor(P[0] / CELL_DEG)), int(math.floor(P[1] / CELL_DEG))
    seen, total = set(), 0.0
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for pid, i in grid.get((cx0 + dx, cy0 + dy), ()):
                if pid in seen:
                    continue
                cs = paths[pid]
                if seg_km(P, cs[i-1], cs[i]) <= THRESH:
                    seen.add(pid); total += PID_W[pid]
    return total
