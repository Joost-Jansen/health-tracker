"""Synthetic GPS tracks for tests."""

import math
import random

HOME = (52.0900, 5.1200)
M_PER_DEG_LAT = 111_320.0


def offset(point, north_m, east_m):
    lat, lon = point
    dlat = north_m / M_PER_DEG_LAT
    dlon = east_m / (M_PER_DEG_LAT * math.cos(math.radians(lat)))
    return (lat + dlat, lon + dlon)


def square_loop(start=HOME, side_m=1000, direction="ne", step_m=10, noise_m=0.0, seed=0):
    """Closed square loop starting and ending at `start`. Perimeter = 4 * side_m."""
    rnd = random.Random(seed)
    sn = 1 if "n" in direction else -1
    se = 1 if "e" in direction else -1
    corners = [(0, 0), (sn * side_m, 0), (sn * side_m, se * side_m), (0, se * side_m), (0, 0)]
    points = []
    for (n0, e0), (n1, e1) in zip(corners, corners[1:]):
        steps = int(max(abs(n1 - n0), abs(e1 - e0)) / step_m)
        for i in range(steps):
            n = n0 + (n1 - n0) * i / steps + rnd.uniform(-noise_m, noise_m)
            e = e0 + (e1 - e0) * i / steps + rnd.uniform(-noise_m, noise_m)
            points.append(offset(start, n, e))
    points.append(start)
    return [list(p) for p in points]


def out_and_back(start=HOME, length_m=3000, bearing="n", step_m=10):
    sign = 1 if bearing == "n" else -1
    steps = int(length_m / step_m)
    out = [offset(start, sign * length_m * i / steps, 0) for i in range(steps + 1)]
    return [list(p) for p in out + out[::-1][1:]]


def run(activity_id, date, latlng, distance_km, **extra):
    base = {
        "activity_id": activity_id,
        "date": date,
        "distance_km": distance_km,
        "latlng": latlng,
        "elevation_gain_m": 5.0,
        "avg_hr": 148,
        "moving_time_s": int(distance_km * 320),
    }
    base.update(extra)
    return base
