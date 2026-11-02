"""Built-in multi-vehicle scenario simulator for V2X testing and validation (Uzbekistan / Tashkent base).
Ensures all vehicles strictly follow real street centerlines and lanes without drifting off-road or clipping buildings.
"""
import asyncio
import math
import time
from typing import Dict, List, Optional, Tuple
from app.models import VehicleTelemetry, VehicleType
from app.manager import hub
from app.spatial_index import METERS_PER_DEGREE_LAT


# Базовые координаты: Ташкент, Узбекистан (Проспект Амира Темура и ул. Абдуллы Кадыри)
DEFAULT_UZBEKISTAN_LAT = 41.31950
DEFAULT_UZBEKISTAN_LON = 69.28165

# Реальные полилинии проезжих частей дорог Ташкента (OpenStreetMap)
TASHKENT_ROADS = {
    # Проспект Амира Темура: Северное направление (3-4 полосы)
    "amir_temur_nb": [
        (41.31700, 69.28111),
        (41.31825, 69.28139),
        (41.31950, 69.28165),
        (41.32050, 69.28187),
        (41.32140, 69.28207),
        (41.32172, 69.28214), # Перекресток с ул. Абдуллы Кадыри
        (41.32211, 69.28223),
        (41.32357, 69.28252),
        (41.32550, 69.28293)
    ],
    # Проспект Амира Темура: Южное направление (встречная проезжая часть)
    "amir_temur_sb": [
        (41.32558, 69.28273),
        (41.32357, 69.28232),
        (41.32214, 69.28200),
        (41.32172, 69.28192), # Перекресток с ул. Абдуллы Кадыри
        (41.32105, 69.28177),
        (41.31863, 69.28126),
        (41.31685, 69.28088)
    ],
    # Улица Абдуллы Кадыри: Западное направление (3 полосы)
    "abdulla_qodiriy_wb": [
        (41.32109, 69.28655),
        (41.32136, 69.28580),
        (41.32145, 69.28420),
        (41.32155, 69.28300),
        (41.32172, 69.28214), # Перекресток с пр. Амира Темура
        (41.32181, 69.28104),
        (41.32193, 69.27956),
        (41.32227, 69.27927),
        (41.32249, 69.27738)
    ],
    # Улица Абдуллы Кадыри: Восточное направление (встречная проезжая часть)
    "abdulla_qodiriy_eb": [
        (41.32184, 69.27720),
        (41.32181, 69.27953),
        (41.32162, 69.28104),
        (41.32152, 69.28214), # Перекресток с пр. Амира Темура
        (41.32140, 69.28292),
        (41.32094, 69.28649)
    ]
}


class LaneFollower:
    """Точное физическое следование по полосе движения (траектория асфальтовой дороги)."""

    def __init__(self, waypoints: List[Tuple[float, float]], speed_kmh: float = 50.0, lane_offset: float = 0.0):
        self.waypoints = waypoints
        self.speed_kmh = speed_kmh
        self.start_speed = speed_kmh
        self.lane_offset = lane_offset  # Смещение относительно осевой линии полосы (+3.5м вправо, -3.5м влево)
        self.current_distance = 0.0
        self.start_distance = 0.0

        # Предварительный расчет сегментов дороги
        self.segments = []
        self.total_length = 0.0
        for i in range(len(waypoints) - 1):
            p1 = waypoints[i]
            p2 = waypoints[i + 1]
            lat_rad = math.radians((p1[0] + p2[0]) / 2.0)
            meters_per_deg_lon = METERS_PER_DEGREE_LAT * math.cos(lat_rad)
            dn = (p2[0] - p1[0]) * METERS_PER_DEGREE_LAT
            de = (p2[1] - p1[1]) * meters_per_deg_lon
            length = math.hypot(dn, de)
            bearing = (math.degrees(math.atan2(de, dn)) + 360.0) % 360.0
            self.segments.append({
                "p1": p1,
                "p2": p2,
                "length": max(0.1, length),
                "bearing": bearing,
                "cum_start": self.total_length,
                "cum_end": self.total_length + length
            })
            self.total_length += length

    def set_start_distance(self, dist: float):
        self.start_distance = dist % self.total_length if self.total_length > 0 else 0.0
        self.current_distance = self.start_distance

    def reset(self):
        self.current_distance = self.start_distance
        self.speed_kmh = self.start_speed

    def step(self, dt: float) -> Tuple[float, float, float]:
        dist_delta = (self.speed_kmh / 3.6) * dt
        if self.total_length > 0:
            self.current_distance = (self.current_distance + dist_delta) % self.total_length
        return self.get_pose()

    def get_pose(self) -> Tuple[float, float, float]:
        if not self.segments:
            return (self.waypoints[0][0], self.waypoints[0][1], 0.0)

        d = self.current_distance
        seg = self.segments[-1]
        for s in self.segments:
            if s["cum_start"] <= d <= s["cum_end"]:
                seg = s
                break

        ratio = (d - seg["cum_start"]) / seg["length"]
        ratio = max(0.0, min(1.0, ratio))
        lat_base = seg["p1"][0] + (seg["p2"][0] - seg["p1"][0]) * ratio
        lon_base = seg["p1"][1] + (seg["p2"][1] - seg["p1"][1]) * ratio
        heading = seg["bearing"]

        if self.lane_offset != 0.0:
            perp_rad = math.radians(heading + 90.0)
            lat_rad = math.radians(lat_base)
            meters_per_deg_lon = METERS_PER_DEGREE_LAT * math.cos(lat_rad)
            off_north = self.lane_offset * math.cos(perp_rad)
            off_east = self.lane_offset * math.sin(perp_rad)
            lat = lat_base + off_north / METERS_PER_DEGREE_LAT
            lon = lon_base + off_east / meters_per_deg_lon
        else:
            lat = lat_base
            lon = lon_base

        return lat, lon, heading


class SimulatedVehicle:
    def __init__(
        self,
        vehicle_id: str,
        vehicle_type: VehicleType,
        follower: LaneFollower
    ):
        self.vehicle_id = vehicle_id
        self.vehicle_type = vehicle_type
        self.follower = follower
        lat, lon, heading = self.follower.get_pose()
        self.lat = lat
        self.lon = lon
        self.heading = heading
        self.speed = follower.speed_kmh

    def reset(self):
        self.follower.reset()
        lat, lon, heading = self.follower.get_pose()
        self.lat = lat
        self.lon = lon
        self.heading = heading
        self.speed = self.follower.speed_kmh

    def step(self, dt: float):
        lat, lon, heading = self.follower.step(dt)
        self.lat = lat
        self.lon = lon
        self.heading = heading
        self.speed = self.follower.speed_kmh

    def to_telemetry(self) -> VehicleTelemetry:
        return VehicleTelemetry(
            vehicle_id=self.vehicle_id,
            vehicle_type=self.vehicle_type,
            lat=round(self.lat, 7),
            lon=round(self.lon, 7),
            speed=round(self.speed, 1),
            heading=round(self.heading, 1),
            stealth=False,
            client_time=time.time() * 1000.0
        )


class TrafficSimulator:
    """Генератор сценариев моделирования дорожных ситуаций в Узбекистане (строго по полосам движения)."""

    def __init__(self):
        self.anchor_lat = DEFAULT_UZBEKISTAN_LAT
        self.anchor_lon = DEFAULT_UZBEKISTAN_LON
        self.scenario_name = "intersection_blind"
        self.is_running = False
        self.speed_multiplier = 1.0
        self.simulated_vehicles: Dict[str, SimulatedVehicle] = {}
        self._task: Optional[asyncio.Task] = None
        self._init_scenario(self.scenario_name)

    def set_anchor(self, lat: float, lon: float):
        """Динамическая привязка окружения к реальным координатам пользователя."""
        dlat = abs(self.anchor_lat - lat)
        dlon = abs(self.anchor_lon - lon)
        if dlat > 0.0005 or dlon > 0.0005:
            self.anchor_lat = lat
            self.anchor_lon = lon
            self._init_scenario(self.scenario_name)

    def _get_road_corridors(self) -> Dict[str, List[Tuple[float, float]]]:
        """Возвращает коридоры дорог. В Ташкенте — реальные улицы, вне Ташкента — параллельные полосы вокруг якоря."""
        is_near_tashkent = (abs(self.anchor_lat - 41.32) < 0.08 and abs(self.anchor_lon - 69.28) < 0.08)
        if is_near_tashkent:
            return TASHKENT_ROADS

        # Вне Ташкента: генерируем перекресток 2 магистралей вокруг якорной точки
        lat_rad = math.radians(self.anchor_lat)
        meters_per_deg_lon = METERS_PER_DEGREE_LAT * math.cos(lat_rad)

        def pt(de, dn):
            return (self.anchor_lat + dn / METERS_PER_DEGREE_LAT, self.anchor_lon + de / meters_per_deg_lon)

        return {
            "amir_temur_nb": [pt(0.0, -350.0), pt(0.0, -100.0), pt(0.0, 0.0), pt(0.0, 150.0), pt(0.0, 350.0)],
            "amir_temur_sb": [pt(14.0, 350.0), pt(14.0, 150.0), pt(14.0, 0.0), pt(14.0, -100.0), pt(14.0, -350.0)],
            "abdulla_qodiriy_wb": [pt(350.0, 0.0), pt(150.0, 0.0), pt(0.0, 0.0), pt(-150.0, 0.0), pt(-350.0, 0.0)],
            "abdulla_qodiriy_eb": [pt(-350.0, -14.0), pt(-150.0, -14.0), pt(0.0, -14.0), pt(150.0, -14.0), pt(350.0, -14.0)]
        }

    def _init_scenario(self, name: str):
        # Очищаем предыдущие ТС
        for vid in list(self.simulated_vehicles.keys()):
            hub.spatial_grid.remove_vehicle(vid)
        self.simulated_vehicles.clear()
        self.scenario_name = name

        roads = self._get_road_corridors()

        if name == "intersection_blind":
            # СЦЕНАРИЙ 1: Перекресток пр. Амира Темура и ул. Абдуллы Кадыри
            # Эго едет на Север по пр. Амира Темура
            # Грузовик TRUCK-901 едет по полосе ул. Абдуллы Кадыри на Запад (сближение на перекрестке)
            truck_follower = LaneFollower(roads["abdulla_qodiriy_wb"], speed_kmh=52.0, lane_offset=0.0)
            truck_follower.set_start_distance(230.0) # ~170м до перекрестка

            # Такси TAXI-304 едет сзади Эго в правой полосе пр. Амира Темура
            taxi_follower = LaneFollower(roads["amir_temur_nb"], speed_kmh=45.0, lane_offset=3.5)
            taxi_follower.set_start_distance(215.0)

            self.simulated_vehicles = {
                "TRUCK-901": SimulatedVehicle("TRUCK-901", VehicleType.TRUCK, truck_follower),
                "TAXI-304": SimulatedVehicle("TAXI-304", VehicleType.CAR, taxi_follower)
            }

        elif name == "blind_spot_overtake":
            # СЦЕНАРИЙ 2: Слепая зона и обгон на многополосном шоссе
            sport_follower = LaneFollower(roads["amir_temur_nb"], speed_kmh=88.0, lane_offset=-3.5)
            sport_follower.set_start_distance(210.0) # нагоняет слева

            van_follower = LaneFollower(roads["amir_temur_nb"], speed_kmh=44.0, lane_offset=3.5)
            van_follower.set_start_distance(320.0) # впереди справа

            self.simulated_vehicles = {
                "SPORT-77": SimulatedVehicle("SPORT-77", VehicleType.CAR, sport_follower),
                "VAN-12": SimulatedVehicle("VAN-12", VehicleType.BUS, van_follower)
            }

        elif name == "head_on_curve":
            # СЦЕНАРИЙ 3: Встречный разъезд по смежным полосам
            bus_follower = LaneFollower(roads["amir_temur_sb"], speed_kmh=48.0, lane_offset=0.0)
            bus_follower.set_start_distance(180.0)

            self.simulated_vehicles = {
                "BUS-401": SimulatedVehicle("BUS-401", VehicleType.BUS, bus_follower)
            }

        elif name == "urban_traffic":
            # СЦЕНАРИЙ 4: Плотный городской поток Ташкента (6 машин строго на полосах дорог)
            v1 = SimulatedVehicle("UZB-101", VehicleType.CAR, LaneFollower(roads["amir_temur_nb"], 48.0, 3.5))
            v1.follower.set_start_distance(140.0)

            v2 = SimulatedVehicle("UZB-102", VehicleType.CAR, LaneFollower(roads["amir_temur_nb"], 55.0, -3.5))
            v2.follower.set_start_distance(310.0)

            v3 = SimulatedVehicle("UZB-103", VehicleType.TRUCK, LaneFollower(roads["abdulla_qodiriy_wb"], 45.0, 0.0))
            v3.follower.set_start_distance(120.0)

            v4 = SimulatedVehicle("UZB-104", VehicleType.CAR, LaneFollower(roads["abdulla_qodiriy_eb"], 50.0, 0.0))
            v4.follower.set_start_distance(180.0)

            v5 = SimulatedVehicle("UZB-105", VehicleType.BUS, LaneFollower(roads["amir_temur_sb"], 42.0, 3.5))
            v5.follower.set_start_distance(220.0)

            v6 = SimulatedVehicle("UZB-106", VehicleType.CAR, LaneFollower(roads["amir_temur_sb"], 58.0, -3.5))
            v6.follower.set_start_distance(400.0)

            self.simulated_vehicles = {
                "UZB-101": v1, "UZB-102": v2, "UZB-103": v3,
                "UZB-104": v4, "UZB-105": v5, "UZB-106": v6
            }

    def set_scenario(self, name: str):
        self._init_scenario(name)

    def reset(self):
        for v in self.simulated_vehicles.values():
            v.reset()

    async def _run_loop(self):
        dt = 0.1  # 10 Hz
        while self.is_running:
            start_loop = time.time()
            effective_dt = dt * self.speed_multiplier

            for v in self.simulated_vehicles.values():
                v.step(effective_dt)
                telem = v.to_telemetry()
                hub.spatial_grid.update_vehicle(telem)

            elapsed = time.time() - start_loop
            sleep_time = max(0.001, dt - elapsed)
            await asyncio.sleep(sleep_time)

    def start(self):
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self._run_loop())

    def stop(self):
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
        for vid in list(self.simulated_vehicles.keys()):
            hub.spatial_grid.remove_vehicle(vid)


simulator = TrafficSimulator()
