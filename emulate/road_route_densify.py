"""
road_route_densify.py

1. Fetches a driving route between two points from the free OSRM API.
2. Takes the "major" points OSRM returns.
3. Recursively inserts extra interpolated points between each pair of
   consecutive major points until every gap is smaller than a chosen
   max distance (in meters).
4. Saves the final dense sequence to a CSV file.

Usage:
    python road_route_densify.py

Edit START / END / MAX_GAP_METERS below to change the route or density.
"""

import json
import math
import csv
import urllib.request

# ---------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------
START = (26.663059, 87.274012)   # (lat, lon) Itahari
END   = (26.655735, 87.657518)   # (lat, lon) Damak
MAX_GAP_METERS = 25              # recursively split until gaps <= this
OUTPUT_CSV = "route_dense.csv"


# ---------------------------------------------------------------------
# STEP 1: fetch the "major" route points from OSRM
# ---------------------------------------------------------------------
def fetch_route(start, end):
    lat1, lon1 = start
    lat2, lon2 = end
    url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{lon1},{lat1};{lon2},{lat2}"
        "?overview=full&geometries=geojson"
    )
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    if data.get("code") != "Ok":
        raise RuntimeError(f"OSRM error: {data}")

    coords = data["routes"][0]["geometry"]["coordinates"]  # [lon, lat] pairs
    # convert to (lat, lon) for consistency with the rest of the script
    return [(lat, lon) for lon, lat in coords]


# ---------------------------------------------------------------------
# STEP 2: distance between two (lat, lon) points, in meters (haversine)
# ---------------------------------------------------------------------
def haversine_m(p1, p2):
    lat1, lon1 = p1
    lat2, lon2 = p2
    R = 6371000  # earth radius, meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------
# STEP 3: RECURSIVE densification
# If the gap between two points is bigger than max_gap, insert the
# midpoint and recurse on both halves. Keeps splitting until every
# segment is under the threshold.
# ---------------------------------------------------------------------
def densify_segment(p1, p2, max_gap, points_out):
    dist = haversine_m(p1, p2)

    if dist <= max_gap:
        points_out.append(p2)
        return

    mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)

    densify_segment(p1, mid, max_gap, points_out)
    densify_segment(mid, p2, max_gap, points_out)


def densify_route(major_points, max_gap):
    dense = [major_points[0]]  # start with the first point

    for i in range(len(major_points) - 1):
        p1 = major_points[i]
        p2 = major_points[i + 1]
        densify_segment(p1, p2, max_gap, dense)

    return dense


# ---------------------------------------------------------------------
# STEP 4: save sequence
# ---------------------------------------------------------------------
def save_csv(points, path):
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["index", "lat", "lon"])
        for i, (lat, lon) in enumerate(points):
            writer.writerow([i, lat, lon])


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

    save_csv(dense_points, OUTPUT_CSV)
    print(f"Saved to {OUTPUT_CSV}")
