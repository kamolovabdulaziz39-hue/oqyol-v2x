"""Built-in multi-vehicle scenario simulator for V2X testing and validation (Uzbekistan / Tashkent base)."""
import asyncio
import math
import time
from typing import Dict, List, Optional
from app.models import VehicleTelemetry, VehicleType
from app.manager import hub
from app.spatial_index import METERS_PER_DEGREE_LAT


# Базовые координаты: Ташкент, Узбекистан (Сквер Амира Темура / ул. Навои)
DEFAULT_UZBEKISTAN_LAT = 41.311081
DEFAULT_UZBEKISTAN_LON = 69.279737


class SimulatedVehicle:
    def __init__(
        self,
        vehicle_id: str,
        vehicle_type: VehicleType,
        lat: float,
        lon: float,
        speed: float,
        heading: float,
        rel_offset_meters: tuple = (0.0, 0.0), # (d_east, d_north)
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
        self.rel_offset_meters = rel_offset_meters
        self.behavior = behavior

    def reset(self):
        self.lat = self.start_lat
        self.lon = self.start_lon
        self.speed = self.start_speed
        self.heading = self.start_heading

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
    """Генератор сценариев моделирования дорожных ситуаций в Узбекистане."""

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
        """Динамическая привязка окружения к реальным координатам пользователя (в любой точке Узбекистана)."""
        # Если координаты сместились больше чем на 10 метров, перестраиваем окружающие ТС
        dlat = abs(self.anchor_lat - lat)
        dlon = abs(self.anchor_lon - lon)
        if dlat > 0.0001 or dlon > 0.0001:
            self.anchor_lat = lat
            self.anchor_lon = lon
            self._init_scenario(self.scenario_name)

    def _meters_to_lat_lon(self, d_east: float, d_north: float) -> tuple:
        lat_rad = math.radians(self.anchor_lat)
        meters_per_deg_lon = METERS_PER_DEGREE_LAT * math.cos(lat_rad)
        lat = self.anchor_lat + (d_north / METERS_PER_DEGREE_LAT)
        lon = self.anchor_lon + (d_east / meters_per_deg_lon)
        return lat, lon

    def _init_scenario(self, name: str):
        # Удаляем предыдущие ТС симулятора из пространственного индекса
        for vid in list(self.simulated_vehicles.keys()):
            hub.spatial_grid.remove_vehicle(vid)
        self.simulated_vehicles.clear()
        self.scenario_name = name

        if name == "intersection_blind":
            # СЦЕНАРИЙ 1: Перекресток и слепая зона (T-Bone риск в Ташкенте)
            # Пользователь едет с Юга на Север (heading=0)
            # Грузовик TRUCK-901 едет с Востока на Запад (heading=270) с пересечением через ~3 сек
            truck_lat, truck_lon = self._meters_to_lat_lon(d_east=140.0, d_north=40.0)
            taxi_lat, taxi_lon = self._meters_to_lat_lon(d_east=10.0, d_north=-120.0)

            self.simulated_vehicles = {
                "TRUCK-901": SimulatedVehicle(
                    vehicle_id="TRUCK-901",
                    vehicle_type=VehicleType.TRUCK,
                    lat=truck_lat,
                    lon=truck_lon,
                    speed=52.0,
                    heading=270.0,
                    rel_offset_meters=(140.0, 40.0),
                    behavior="loop_intersection"
                ),
                "TAXI-304": SimulatedVehicle(
                    vehicle_id="TAXI-304",
                    vehicle_type=VehicleType.CAR,
                    lat=taxi_lat,
                    lon=taxi_lon,
                    speed=42.0,
                    heading=0.0,
                    rel_offset_meters=(10.0, -120.0)
                )
            }

        elif name == "blind_spot_overtake":
            # СЦЕНАРИЙ 2: Слепая зона и опасный обгон
            sport_lat, sport_lon = self._meters_to_lat_lon(d_east=-35.0, d_north=8.0)
            van_lat, van_lon = self._meters_to_lat_lon(d_east=70.0, d_north=-10.0)

            self.simulated_vehicles = {
                "SPORT-77": SimulatedVehicle(
                    vehicle_id="SPORT-77",
                    vehicle_type=VehicleType.CAR,
                    lat=sport_lat,
                    lon=sport_lon,
                    speed=90.0,
                    heading=90.0,
                    rel_offset_meters=(-35.0, 8.0)
                ),
                "VAN-12": SimulatedVehicle(
                    vehicle_id="VAN-12",
                    vehicle_type=VehicleType.BUS,
                    lat=van_lat,
                    lon=van_lon,
                    speed=55.0,
                    heading=90.0,
                    rel_offset_meters=(70.0, -10.0)
                )
            }

        elif name == "head_on_curve":
            # СЦЕНАРИЙ 3: Лобовое сближение на узком участке / в повороте
            bus_lat, bus_lon = self._meters_to_lat_lon(d_east=8.0, d_north=180.0)
            self.simulated_vehicles = {
                "BUS-401": SimulatedVehicle(
                    vehicle_id="BUS-401",
                    vehicle_type=VehicleType.BUS,
                    lat=bus_lat,
                    lon=bus_lon,
                    speed=50.0,
                    heading=180.0,
                    rel_offset_meters=(8.0, 180.0)
                )
            }

        elif name == "urban_traffic":
            # СЦЕНАРИЙ 4: Плотный городской трафик Ташкента (6 автомобилей вокруг)
            vehicles = {}
            types = [VehicleType.CAR, VehicleType.CAR, VehicleType.TRUCK, VehicleType.BUS]
            offsets = [
                (120.0, 100.0, 48.0, 220.0),
                (-90.0, 140.0, 52.0, 310.0),
                (-130.0, -80.0, 40.0, 45.0),
                (150.0, -110.0, 50.0, 135.0),
                (40.0, 220.0, 35.0, 270.0),
                (-30.0, -190.0, 58.0, 0.0)
            ]
            for i, (de, dn, spd, hdg) in enumerate(offsets):
                v_id = f"UZB-{100 + i}"
                v_lat, v_lon = self._meters_to_lat_lon(de, dn)
                vehicles[v_id] = SimulatedVehicle(
                    vehicle_id=v_id,
                    vehicle_type=types[i % len(types)],
                    lat=v_lat,
                    lon=v_lon,
                    speed=spd,
                    heading=hdg,
                    rel_offset_meters=(de, dn)
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

                # Зацикливание движения вокруг якорной точки
                lat_rad = math.radians(self.anchor_lat)
                meters_per_deg_lon = METERS_PER_DEGREE_LAT * math.cos(lat_rad)
                d_north = (v.lat - self.anchor_lat) * METERS_PER_DEGREE_LAT
                d_east = (v.lon - self.anchor_lon) * meters_per_deg_lon

                if self.scenario_name == "intersection_blind":
                    if v.vehicle_id == "TRUCK-901" and d_east < -180.0:
                        v.lat, v.lon = self._meters_to_lat_lon(160.0, 40.0)
                    elif v.vehicle_id == "TAXI-304" and d_north > 180.0:
                        v.lat, v.lon = self._meters_to_lat_lon(10.0, -160.0)

                elif self.scenario_name == "blind_spot_overtake":
                    if v.vehicle_id == "SPORT-77" and d_east > 160.0:
                        v.lat, v.lon = self._meters_to_lat_lon(-100.0, 8.0)

                elif self.scenario_name == "head_on_curve":
                    if d_north < -150.0:
                        v.lat, v.lon = self._meters_to_lat_lon(8.0, 180.0)

                elif self.scenario_name == "urban_traffic":
                    if math.hypot(d_east, d_north) > 400.0:
                        de, dn = v.rel_offset_meters
                        v.lat, v.lon = self._meters_to_lat_lon(de, dn)

                # Отправка в spatial grid
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
