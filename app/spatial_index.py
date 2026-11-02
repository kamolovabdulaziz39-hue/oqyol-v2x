"""High-performance Spatial Hash Index for ultra-low latency V2X geofencing."""
import math
import time
from typing import Dict, List, Set, Tuple, Optional
from app.models import VehicleTelemetry


# Земной эллипсоид WGS-84
EARTH_RADIUS_METERS = 6371000.0
METERS_PER_DEGREE_LAT = 111139.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Вычисление точного ортодромического расстояния между двумя точками в метрах."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c


def fast_equirectangular_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Быстрая аппроксимация расстояния для локальных радиусов (< 10 км)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    x = math.radians(lon2 - lon1) * math.cos((phi1 + phi2) / 2.0)
    y = math.radians(lat2 - lat1)
    return EARTH_RADIUS_METERS * math.hypot(x, y)


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Вычисление азимута (направления в градусах от 0 до 359.9) от точки 1 к точке 2."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)

    y = math.sin(delta_lon) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lon)
    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360.0) % 360.0


class SpatialHashGrid:
    """
    Пространственный хэш-индекс (Spatial Hash Grid) с временной сложностью O(1) для обновления
    и O(k) для выборки соседних объектов в заданном радиусе (1-3 км).
    """

    def __init__(self, cell_size_meters: float = 500.0):
        self.cell_size_meters = cell_size_meters
        # Ячейка: (cell_x, cell_y) -> Set[vehicle_id]
        self._grid: Dict[Tuple[int, int], Set[str]] = {}
        # vehicle_id -> (cell_key, telemetry, last_updated_epoch)
        self._vehicles: Dict[str, Tuple[Tuple[int, int], VehicleTelemetry, float]] = {}

    def _get_cell_key(self, lat: float, lon: float) -> Tuple[int, int]:
        lat_rad = math.radians(lat)
        meters_per_deg_lon = METERS_PER_DEGREE_LAT * max(math.cos(lat_rad), 0.01)

        deg_lat_per_cell = self.cell_size_meters / METERS_PER_DEGREE_LAT
        deg_lon_per_cell = self.cell_size_meters / meters_per_deg_lon

        cell_y = int(math.floor(lat / deg_lat_per_cell))
        cell_x = int(math.floor(lon / deg_lon_per_cell))
        return (cell_x, cell_y)

    def update_vehicle(self, telemetry: VehicleTelemetry) -> None:
        """Обновление положения ТС в пространственном индексе (O(1))."""
        vid = telemetry.vehicle_id
        new_cell = self._get_cell_key(telemetry.lat, telemetry.lon)
        now = time.time()

        if vid in self._vehicles:
            old_cell, _, _ = self._vehicles[vid]
            if old_cell != new_cell and old_cell in self._grid:
                self._grid[old_cell].discard(vid)
                if not self._grid[old_cell]:
                    del self._grid[old_cell]

        if new_cell not in self._grid:
            self._grid[new_cell] = set()
        self._grid[new_cell].add(vid)
        self._vehicles[vid] = (new_cell, telemetry, now)

    def remove_vehicle(self, vehicle_id: str) -> None:
        """Удаление ТС при отключении (O(1))."""
        if vehicle_id in self._vehicles:
            old_cell, _, _ = self._vehicles[vehicle_id]
            if old_cell in self._grid:
                self._grid[old_cell].discard(vehicle_id)
                if not self._grid[old_cell]:
                    del self._grid[old_cell]
            del self._vehicles[vehicle_id]

    def get_vehicle(self, vehicle_id: str) -> Optional[VehicleTelemetry]:
        """Получить текущую телеметрию ТС."""
        if vehicle_id in self._vehicles:
            return self._vehicles[vehicle_id][1]
        return None

    def query_radius(
        self,
        lat: float,
        lon: float,
        radius_meters: float,
        exclude_vehicle_id: Optional[str] = None,
        exclude_stealth: bool = True
    ) -> List[Tuple[VehicleTelemetry, float]]:
        """
        Поиск всех ТС в радиусе radius_meters.
        Возвращает список пар (VehicleTelemetry, distance_meters).
        """
        lat_rad = math.radians(lat)
        meters_per_deg_lon = METERS_PER_DEGREE_LAT * max(math.cos(lat_rad), 0.01)

        deg_lat_per_cell = self.cell_size_meters / METERS_PER_DEGREE_LAT
        deg_lon_per_cell = self.cell_size_meters / meters_per_deg_lon

        cells_span_y = int(math.ceil(radius_meters / self.cell_size_meters))
        cells_span_x = int(math.ceil(radius_meters / self.cell_size_meters))

        center_cell_x, center_cell_y = self._get_cell_key(lat, lon)

        results: List[Tuple[VehicleTelemetry, float]] = []

        for dy in range(-cells_span_y, cells_span_y + 1):
            for dx in range(-cells_span_x, cells_span_x + 1):
                cell_key = (center_cell_x + dx, center_cell_y + dy)
                v_ids = self._grid.get(cell_key)
                if not v_ids:
                    continue

                for vid in v_ids:
                    if exclude_vehicle_id and vid == exclude_vehicle_id:
                        continue

                    _, telemetry, _ = self._vehicles[vid]

                    if exclude_stealth and telemetry.stealth:
                        # Режим невидимки: ТС скрыто от соседних ТС
                        continue

                    dist = fast_equirectangular_distance(lat, lon, telemetry.lat, telemetry.lon)
                    if dist <= radius_meters:
                        results.append((telemetry, dist))

        # Сортировка по возрастанию дистанции (ближайшие первыми)
        results.sort(key=lambda item: item[1])
        return results

    def prune_stale(self, max_age_seconds: float = 5.0) -> int:
        """Очистка устаревших ТС, потерявших связь."""
        now = time.time()
        stale_ids = [
            vid for vid, (_, _, last_seen) in self._vehicles.items()
            if now - last_seen > max_age_seconds
        ]
        for vid in stale_ids:
            self.remove_vehicle(vid)
        return len(stale_ids)

    def total_active_vehicles(self) -> int:
        return len(self._vehicles)

    def get_all_vehicles(self) -> List[VehicleTelemetry]:
        """Возвращает все активные телеметрии ТС в сетке."""
        return [entry[0] for entry in self._vehicles.values()]
