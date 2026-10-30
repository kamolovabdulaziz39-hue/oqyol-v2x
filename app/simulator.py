"""Built-in multi-vehicle scenario simulator for V2X testing and validation."""
import asyncio
import math
import time
from typing import Dict, List, Optional
from app.models import VehicleTelemetry, VehicleType
from app.manager import hub
from app.spatial_index import METERS_PER_DEGREE_LAT


# Базовая точка (Центр Москвы / полигон для испытаний)
BASE_LAT = 55.751244
BASE_LON = 37.618423


class SimulatedVehicle:
    def __init__(
        self,
        vehicle_id: str,
        vehicle_type: VehicleType,
        lat: float,
        lon: float,
        speed: float,
        heading: float,
        waypoints: Optional[List[tuple]] = None,
        behavior: str = "straight"
    ):
        self.vehicle_id = vehicle_id
        self.vehicle_type = vehicle_type
        self.lat = lat
        self.lon = lon
        self.speed = speed
        self.heading = heading
        self.start_lat = lat
        self.start_lon = lon
        self.start_speed = speed
        self.start_heading = heading
        self.waypoints = waypoints or []
        self.current_wp_idx = 0
        self.behavior = behavior

    def reset(self):
        self.lat = self.start_lat
        self.lon = self.start_lon
        self.speed = self.start_speed
        self.heading = self.start_heading
        self.current_wp_idx = 0

    def step(self, dt: float):
        """Продвижение ТС по времени dt (сек) с физическим обновлением координат."""
        speed_ms = self.speed / 3.6
        dist = speed_ms * dt

        rad = math.radians(self.heading)
        d_east = dist * math.sin(rad)
        d_north = dist * math.cos(rad)

        lat_rad = math.radians(self.lat)
        meters_per_deg_lon = METERS_PER_DEGREE_LAT * math.cos(lat_rad)

        self.lat += d_north / METERS_PER_DEGREE_LAT
        self.lon += d_east / meters_per_deg_lon

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
    """Генератор сценариев моделирования дорожных ситуаций."""

    def __init__(self):
        self.scenario_name = "intersection_blind"
        self.is_running = False
        self.speed_multiplier = 1.0
        self.simulated_vehicles: Dict[str, SimulatedVehicle] = {}
        self._task: Optional[asyncio.Task] = None
        self._init_scenario(self.scenario_name)

    def _init_scenario(self, name: str):
        # Удаляем предыдущие ТС симулятора из пространственного индекса
        for vid in self.simulated_vehicles.keys():
            hub.spatial_grid.remove_vehicle(vid)
        self.simulated_vehicles.clear()
        self.scenario_name = name

        if name == "intersection_blind":
            # СЦЕНАРИЙ 1: Перекресток и слепая зона (T-Bone риск)
            # Перекресток находится в BASE_LAT, BASE_LON
            # Эго-ТС едет с Юга на Север (heading=0)
            # Грузовик TRUCK-901 едет с Востока на Запад (heading=270)
            # Еще одно ТС CAR-PEER медленно едет сзади
            self.simulated_vehicles = {
                "TRUCK-901": SimulatedVehicle(
                    vehicle_id="TRUCK-901",
                    vehicle_type=VehicleType.TRUCK,
                    lat=BASE_LAT,
                    lon=BASE_LON + 0.0022,  # ~140 метров восточнее
                    speed=54.0,             # 54 км/ч = 15 м/с
                    heading=270.0,
                    behavior="loop_intersection"
                ),
                "TAXI-304": SimulatedVehicle(
                    vehicle_id="TAXI-304",
                    vehicle_type=VehicleType.CAR,
                    lat=BASE_LAT - 0.0025,
                    lon=BASE_LON + 0.0001,
                    speed=45.0,
                    heading=0.0
                )
            }

        elif name == "blind_spot_overtake":
            # СЦЕНАРИЙ 2: Слепая зона и опасный обгон
            # Эго-ТС едет на Восток (heading=90)
            # Спорткар SPORT-77 стремительно приближается сзади слева в слепой зоне
            self.simulated_vehicles = {
                "SPORT-77": SimulatedVehicle(
                    vehicle_id="SPORT-77",
                    vehicle_type=VehicleType.CAR,
                    lat=BASE_LAT + 0.00008,  # левая полоса
                    lon=BASE_LON - 0.0006,   # сзади в 40м
                    speed=95.0,              # обгоняет
                    heading=90.0
                ),
                "VAN-12": SimulatedVehicle(
                    vehicle_id="VAN-12",
                    vehicle_type=VehicleType.BUS,
                    lat=BASE_LAT - 0.00012,
                    lon=BASE_LON + 0.0009,
                    speed=60.0,
                    heading=90.0
                )
            }

        elif name == "head_on_curve":
            # СЦЕНАРИЙ 3: Лобовое сближение в закрытом повороте
            self.simulated_vehicles = {
                "BUS-401": SimulatedVehicle(
                    vehicle_id="BUS-401",
                    vehicle_type=VehicleType.BUS,
                    lat=BASE_LAT + 0.0025,
                    lon=BASE_LON + 0.0001,
                    speed=55.0,
                    heading=180.0            # Навстречу эго-ТС
                )
            }

        elif name == "urban_traffic":
            # СЦЕНАРИЙ 4: Плотный городской трафик (8 ТС вокруг)
            vehicles = {}
            types = [VehicleType.CAR, VehicleType.TRUCK, VehicleType.BUS, VehicleType.MOTORCYCLE]
            offsets = [
                (0.0015, 0.0015, 50.0, 220.0),
                (-0.0015, 0.0015, 60.0, 310.0),
                (-0.0020, -0.0010, 45.0, 45.0),
                (0.0020, -0.0015, 55.0, 135.0),
                (0.0005, 0.0030, 40.0, 270.0),
                (-0.0005, -0.0025, 65.0, 90.0),
                (0.0030, 0.0000, 50.0, 180.0),
                (-0.0030, 0.0000, 55.0, 0.0),
            ]
            for i, (dlat, dlon, spd, hdg) in enumerate(offsets):
                v_id = f"CITY-{100 + i}"
                vehicles[v_id] = SimulatedVehicle(
                    vehicle_id=v_id,
                    vehicle_type=types[i % len(types)],
                    lat=BASE_LAT + dlat,
                    lon=BASE_LON + dlon,
                    speed=spd,
                    heading=hdg
                )
            self.simulated_vehicles = vehicles

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

                # Зацикливание для сценария перекрестка
                if self.scenario_name == "intersection_blind":
                    if v.vehicle_id == "TRUCK-901" and v.lon < BASE_LON - 0.0025:
                        v.lon = BASE_LON + 0.0025
                    elif v.vehicle_id == "TAXI-304" and v.lat > BASE_LAT + 0.0025:
                        v.lat = BASE_LAT - 0.0025

                elif self.scenario_name == "blind_spot_overtake":
                    if v.vehicle_id == "SPORT-77" and v.lon > BASE_LON + 0.0025:
                        v.lon = BASE_LON - 0.0015

                elif self.scenario_name == "head_on_curve":
                    if v.lat < BASE_LAT - 0.0025:
                        v.lat = BASE_LAT + 0.0025

                # Обновляем телеметрию каждого симулируемого ТС в хабе
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


simulator = TrafficSimulator()
