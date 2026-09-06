"""
h02_emulator.py

Emulates multiple H02-protocol GPS trackers (like the LK106 / common
"*HQ,...#" ASCII protocol used by Traccar's H02 decoder).

- Loads a fixed list of IMEIs from a script-level list.
- Loads a route (list of lat/lon points) - e.g. the CSV produced by
  road_route_densify.py.
- Each simulated device starts at a configurable point along the route
  and walks the route at a configurable speed (km/h) toward the end,
  bouncing back and forth at the endpoints.
- Sends one H02 packet per tick, over TCP, to a target host:port.

IMPORTANT:
  TARGET_HOST is set to localhost (127.0.0.1) intentionally. Only point
  this at a server you own or are explicitly authorized to test against
  (e.g. your own local Traccar instance). Do not repoint this at
  infrastructure you do not control without explicit authorization.

Usage:
    python h02_emulator.py
    (Ctrl+C to stop cleanly - closes all device sockets.)
"""

import csv
import math
import socket
import time
import threading
import random
from datetime import datetime, timezone

# ---------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------
TARGET_HOST = "139.99.135.69"   # localhost only - point at your own test server
TARGET_PORT = 8090

ROUTE_CSV = "route_dense.csv"   # output of road_route_densify.py
                                  # requires at least "lat","lon" columns

# 100 IMEIs (10-digit test ids, clearly not real device identifiers).
NUM_DEVICES = 10
IMEIS = [f"{1000000001 + i:010d}" for i in range(NUM_DEVICES)]

SEND_INTERVAL_SEC = 2.0   # how often each device sends a packet
RUN_SECONDS = None        # stop the whole simulation after this long (None = run until Ctrl+C)


# ---------------------------------------------------------------------
# Load route points from CSV
# ---------------------------------------------------------------------
def load_route(path):
    points = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            points.append((float(row["lat"]), float(row["lon"])))
    if len(points) < 2:
        raise ValueError("Route must have at least 2 points")
    return points


def haversine_m(p1, p2):
    lat1, lon1 = p1
    lat2, lon2 = p2
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def bearing_deg(p1, p2):
    lat1, lon1 = map(math.radians, p1)
    lat2, lon2 = map(math.radians, p2)
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    brng = math.degrees(math.atan2(x, y))
    return (brng + 360) % 360


# ---------------------------------------------------------------------
# H02 packet builder
# ---------------------------------------------------------------------
def to_h02_lat(lat):
    hemi = "N" if lat >= 0 else "S"
    lat = abs(lat)
    deg = int(lat)
    minutes = (lat - deg) * 60
    return f"{deg:02d}{minutes:07.4f}", hemi


def to_h02_lon(lon):
    hemi = "E" if lon >= 0 else "W"
    lon = abs(lon)
    deg = int(lon)
    minutes = (lon - deg) * 60
    return f"{deg:03d}{minutes:07.4f}", hemi


def build_h02_packet(imei, lat, lon, speed_kmh, heading_deg):
    now = datetime.now(timezone.utc)
    hhmmss = now.strftime("%H%M%S")
    ddmmyy = now.strftime("%d%m%y")
    lat_str, ns = to_h02_lat(lat)
    lon_str, ew = to_h02_lon(lon)
    speed_knots = speed_kmh * 0.539957  # H02 speed field is typically knots
    status = "FFFFFFFF"

    packet = (
        f"*HQ,{imei},V1,{hhmmss},A,"
        f"{lat_str},{ns},{lon_str},{ew},"
        f"{speed_knots:06.2f},{heading_deg:.0f},{ddmmyy},{status}#"
    )
    return packet


# ---------------------------------------------------------------------
# Simulated device: bounces back and forth along the route forever.
# Random start index + direction, random base speed with +/-10 km/h wiggle.
# ---------------------------------------------------------------------
class SimulatedDevice(threading.Thread):
    def __init__(self, imei, route, start_index, direction, base_speed,
                 host, port, interval, stop_event):
        super().__init__(daemon=True)
        self.imei = imei
        self.route = route
        self.last_idx = len(route) - 1
        self.index = start_index
        self.dir = direction          # +1 toward end, -1 toward start
        self.base_speed = base_speed
        self.host = host
        self.port = port
        self.interval = interval
        self.sock = None
        self.stop_event = stop_event

    def connect(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(5)
        self.sock.connect((self.host, self.port))

    def close(self):
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass

    def send(self, packet):
        try:
            self.sock.sendall(packet.encode("ascii"))
        except (OSError, socket.timeout) as e:
            print(f"[{self.imei}] send failed: {e}, reconnecting...")
            try:
                self.connect()
                self.sock.sendall(packet.encode("ascii"))
            except Exception as e2:
                print(f"[{self.imei}] reconnect failed: {e2}")

    def neighbor_index(self):
        """Bounds-clamped neighbor in the current direction.
        Prevents the two original bugs: IndexError when index+dir runs
        past the last point, and silent negative-index wraparound to the
        far end of the route when index+dir goes below 0.
        """
        ni = self.index + self.dir
        if ni < 0:
            return 0
        if ni > self.last_idx:
            return self.last_idx
        return ni

    def step(self, dist_to_cover):
        """Advance index by distance in current direction, bouncing at ends."""
        remaining = dist_to_cover
        while remaining > 0:
            ni = self.neighbor_index()
            if ni == self.index:
                # Already at an endpoint with nowhere to go this direction;
                # flip and stop consuming this tick's distance.
                self.dir *= -1
                break

            seg_dist = haversine_m(self.route[self.index], self.route[ni])
            if seg_dist == 0 or remaining < seg_dist:
                break
            remaining -= seg_dist
            self.index = ni
            if self.index <= 0 or self.index >= self.last_idx:
                self.dir *= -1

    def run(self):
        try:
            self.connect()
        except Exception as e:
            print(f"[{self.imei}] initial connect failed: {e}")
            return

        print(f"[{self.imei}] starting at route index {self.index}, "
              f"dir {'+1' if self.dir > 0 else '-1'}, "
              f"base speed {self.base_speed:.1f} km/h")

        while not self.stop_event.is_set():
            speed = max(0.0, self.base_speed + random.uniform(-10, 10))
            p1 = self.route[self.index]
            ni = self.neighbor_index()
            p2 = self.route[ni]
            heading = bearing_deg(p1, p2) if ni != self.index else 0.0

            packet = build_h02_packet(self.imei, p1[0], p1[1], speed, heading)
            self.send(packet)
            print(f"[{self.imei}] -> {packet}")

            speed_mps = speed * 1000 / 3600
            self.step(speed_mps * self.interval)

            # Sleep in small slices so we notice stop_event promptly.
            self.stop_event.wait(self.interval)

        self.close()


# ---------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------
if __name__ == "__main__":
    route = load_route(ROUTE_CSV)
    print(f"Loaded route with {len(route)} points")

    stop_event = threading.Event()
    threads = []

    for imei in IMEIS:
        start_index = random.randint(0, len(route) - 1)
        direction = random.choice([1, -1])
        base_speed = random.uniform(20, 60)  # km/h, random base per device

        device = SimulatedDevice(
            imei=imei,
            route=route,
            start_index=start_index,
            direction=direction,
            base_speed=base_speed,
            host=TARGET_HOST,
            port=TARGET_PORT,
            interval=SEND_INTERVAL_SEC,
            stop_event=stop_event,
        )
        threads.append(device)
        device.start()
        time.sleep(0.2)  # stagger connections slightly

    try:
        if RUN_SECONDS is not None:
            stop_event.wait(RUN_SECONDS)
            print(f"\nRUN_SECONDS ({RUN_SECONDS}s) elapsed, stopping devices...")
            stop_event.set()
        else:
            while any(t.is_alive() for t in threads):
                time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nCtrl+C received, stopping devices...")
        stop_event.set()

    for t in threads:
        t.join(timeout=5)

    print("All devices done.")
