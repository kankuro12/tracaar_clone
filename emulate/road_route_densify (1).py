"""
road_route_densify.py

1. Fetches a driving route between two points from the free OSRM API.
2. Takes the "major" points OSRM returns.
3. Iteratively inserts EVENLY-SPACED interpolated points between each pair
   of consecutive major points, using true great-circle (spherical)
   interpolation, until every gap is <= a chosen max distance (in meters).
4. Adds cumulative distance, bearing, and (optionally) a simulated
   timestamp to each point, so the output can drive a route/GPS simulator.
5. Saves the final dense sequence to a CSV file.

Usage:
    python road_route_densify.py

Edit START / END / MAX_GAP_METERS / SPEED_KMH below to change the route,
density, and simulated playback speed.
"""

import json
import math
import csv
import time
import urllib.request
import urllib.error

# ---------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------
START = (26.663059, 87.274012)   # (lat, lon) Itahari
END   = (26.655735, 87.657518)   # (lat, lon) Damak
MAX_GAP_METERS = 25              # densify until gaps <= this (must be > 0)
SPEED_KMH = 40                   # assumed constant speed, for sim timestamps
OUTPUT_CSV = "route_dense.csv"
HTTP_RETRIES = 3
HTTP_TIMEOUT = 30


# ---------------------------------------------------------------------
# STEP 1: fetch the "major" route points from OSRM (robust version)
# ---------------------------------------------------------------------
def fetch_route(start, end):
    lat1, lon1 = start
    lat2, lon2 = end
    url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{lon1},{lat1};{lon2},{lat2}"
        "?overview=full&geometries=geojson"
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "road-route-densify/1.0 (+script)"},
    )

    last_err = None
    for attempt in range(1, HTTP_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                data = json.loads(resp.read().decode())
            break
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            if attempt < HTTP_RETRIES:
                time.sleep(1.5 * attempt)
            else:
                raise RuntimeError(
                    f"Failed to reach OSRM after {HTTP_RETRIES} attempts: {e}"
                ) from e
    else:
        raise RuntimeError(f"Failed to reach OSRM: {last_err}")

    if data.get("code") != "Ok":
        raise RuntimeError(f"OSRM error: {data}")

    coords = data["routes"][0]["geometry"]["coordinates"]  # [lon, lat] pairs
    points = [(lat, lon) for lon, lat in coords]

    # Drop consecutive duplicate points (can happen at route steps/waypoints)
    # to avoid zero-length segments downstream.
    deduped = [points[0]]
    for p in points[1:]:
        if p != deduped[-1]:
            deduped.append(p)
    return deduped


# ---------------------------------------------------------------------
# STEP 2: distance & bearing between two (lat, lon) points
# ---------------------------------------------------------------------
def haversine_m(p1, p2):
    lat1, lon1 = p1
    lat2, lon2 = p2
    R = 6371000.0  # earth radius, meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def bearing_deg(p1, p2):
    """Initial compass bearing (0-360, 0 = North) from p1 to p2."""
    lat1, lon1 = math.radians(p1[0]), math.radians(p1[1])
    lat2, lon2 = math.radians(p2[0]), math.radians(p2[1])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    theta = math.atan2(x, y)
    return (math.degrees(theta) + 360) % 360


def slerp(p1, p2, f, angular_dist=None):
    """
    True great-circle interpolation at fraction f in [0, 1] between p1 and p2.
    More precise than averaging lat/lon directly, which cuts inside the
    great-circle arc and drifts off the real path on longer/diagonal segments.
    """
    lat1, lon1 = math.radians(p1[0]), math.radians(p1[1])
    lat2, lon2 = math.radians(p2[0]), math.radians(p2[1])

    if angular_dist is None:
        d = haversine_m(p1, p2) / 6371000.0
    else:
        d = angular_dist

    if d == 0:
        return p1

    a = math.sin((1 - f) * d) / math.sin(d)
    b = math.sin(f * d) / math.sin(d)

    x = a * math.cos(lat1) * math.cos(lon1) + b * math.cos(lat2) * math.cos(lon2)
    y = a * math.cos(lat1) * math.sin(lon1) + b * math.cos(lat2) * math.sin(lon2)
    z = a * math.sin(lat1) + b * math.sin(lat2)

    lat = math.atan2(z, math.sqrt(x * x + y * y))
    lon = math.atan2(y, x)
    return (math.degrees(lat), math.degrees(lon))


# ---------------------------------------------------------------------
# STEP 3: ITERATIVE densification (no recursion, evenly spaced points)
# For each major-point segment, compute exactly how many sub-points are
# needed so every sub-gap is <= max_gap, then place them at even
# fractional steps using great-circle slerp.
# ---------------------------------------------------------------------
def densify_route(major_points, max_gap):
    if max_gap <= 0:
        raise ValueError("MAX_GAP_METERS must be > 0")
    if len(major_points) < 2:
        raise ValueError("Need at least 2 major points to densify a route")

    dense = [major_points[0]]

    for i in range(len(major_points) - 1):
        p1, p2 = major_points[i], major_points[i + 1]
        dist = haversine_m(p1, p2)

        if dist == 0:
            continue  # duplicate point, nothing to add

        n_steps = max(1, math.ceil(dist / max_gap))
        angular_dist = dist / 6371000.0

        for step in range(1, n_steps + 1):
            f = step / n_steps
            dense.append(slerp(p1, p2, f, angular_dist))

    return dense


# ---------------------------------------------------------------------
# STEP 4: save sequence with distance / bearing / simulated timestamp
# ---------------------------------------------------------------------
def save_csv(points, path, speed_kmh):
    speed_mps = speed_kmh * 1000 / 3600
    cumulative_m = 0.0

    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            ["index", "lat", "lon", "step_m", "cumulative_m", "bearing_deg", "elapsed_s"]
        )
        prev = None
        for i, p in enumerate(points):
            step_m = 0.0 if prev is None else haversine_m(prev, p)
            cumulative_m += step_m
            bearing = 0.0 if prev is None else bearing_deg(prev, p)
            elapsed_s = cumulative_m / speed_mps if speed_mps > 0 else 0.0

            writer.writerow([
                i, p[0], p[1],
                round(step_m, 3), round(cumulative_m, 3),
                round(bearing, 2), round(elapsed_s, 2),
            ])
            prev = p


# ---------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------
if __name__ == "__main__":
    print("Fetching route from OSRM...")
    major_points = fetch_route(START, END)
    print(f"Major points returned by OSRM: {len(major_points)}")

    print(f"Densifying so no gap exceeds {MAX_GAP_METERS} m...")
    dense_points = densify_route(major_points, MAX_GAP_METERS)
    print(f"Final dense sequence: {len(dense_points)} points")

    save_csv(dense_points, OUTPUT_CSV, SPEED_KMH)
    print(f"Saved to {OUTPUT_CSV}")
