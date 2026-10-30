"""Connection Manager and V2X Real-Time Telemetry Hub."""
import asyncio
import json
import time
from typing import Dict, Any, Optional
from fastapi import WebSocket
from app.config import settings
from app.models import VehicleTelemetry, SafetyUpdate, SafetyLevel
from app.spatial_index import SpatialHashGrid
from app.collision import evaluate_collision_risk


class V2XHub:
    """Центральный диспетчер подключений и потоковой телеметрии V2X."""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.spatial_grid = SpatialHashGrid(cell_size_meters=settings.SPATIAL_GRID_CELL_SIZE_METERS)
        self.packet_count: int = 0
        self.start_time: float = time.time()
        self.latency_samples: list[float] = []

    async def connect(self, vehicle_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[vehicle_id] = websocket

    def disconnect(self, vehicle_id: str):
        if vehicle_id in self.active_connections:
            del self.active_connections[vehicle_id]
        self.spatial_grid.remove_vehicle(vehicle_id)

    async def process_telemetry(self, telemetry: VehicleTelemetry) -> SafetyUpdate:
        """
        Обработка входящего пакета телеметрии:
        1. Измерение пинга/задержки
        2. Обновление пространственного индекса O(1)
        3. Поиск соседей в радиусе видимости (1-3 км)
        4. Оценка коллизий и расчет траекторий (TTC, CPA, Blind Spot, IMA)
        5. Формирование пакета безопасности
        """
        now_ms = time.time() * 1000.0
        rtt_ms = 0.0
        if telemetry.client_time > 0:
            rtt_ms = max(0.0, now_ms - telemetry.client_time)
            self.latency_samples.append(rtt_ms)
            if len(self.latency_samples) > 200:
                self.latency_samples.pop(0)

        self.packet_count += 1

        # 1. Обновление в пространственной сетке
        self.spatial_grid.update_vehicle(telemetry)

        # 2. Выборка ТС в радиусе обнаружения
        neighbors_raw = self.spatial_grid.query_radius(
            lat=telemetry.lat,
            lon=telemetry.lon,
            radius_meters=settings.AWARENESS_RADIUS_METERS,
            exclude_vehicle_id=telemetry.vehicle_id,
            exclude_stealth=True
        )

        # 3. Расчет рисков столкновения
        safety_assessment, neighbors_info = evaluate_collision_risk(telemetry, neighbors_raw)

        # 4. Формирование ответа
        safety_update = SafetyUpdate(
            type="safety_update",
            server_time=now_ms,
            client_time=telemetry.client_time,
            rtt_ms=round(rtt_ms, 1),
            own_vehicle=telemetry,
            safety=safety_assessment,
            neighbors=neighbors_info
        )

        return safety_update

    def get_stats(self) -> Dict[str, Any]:
        """Статистика производительности сервера."""
        uptime = max(0.1, time.time() - self.start_time)
        avg_latency = (
            sum(self.latency_samples) / len(self.latency_samples)
            if self.latency_samples else 0.0
        )
        return {
            "active_vehicles": self.spatial_grid.total_active_vehicles(),
            "connected_websockets": len(self.active_connections),
            "packets_processed": self.packet_count,
            "packets_per_second": round(self.packet_count / uptime, 1),
            "avg_latency_ms": round(avg_latency, 2),
            "uptime_seconds": round(uptime, 1)
        }


hub = V2XHub()
