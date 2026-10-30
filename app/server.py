"""FastAPI Application: WebSockets V2X Ingestion Gateway & REST API."""
import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import settings
from app.models import VehicleTelemetry
from app.manager import hub
from app.simulator import simulator


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Запуск симулятора фонового трафика при старте
    simulator.start()
    yield
    # Остановка при выключении
    simulator.stop()


app = FastAPI(
    title="V2X Road Safety Navigation Hub",
    description="Кооперативная система взаимного обнаружения транспортных средств и предотвращения ДТП",
    version="1.0.0",
    lifespan=lifespan
)

# Монтирование статических файлов
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    return FileResponse(index_path)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "V2X Navigation Core"}


@app.get("/api/stats")
async def get_stats():
    return hub.get_stats()


class ScenarioRequest(BaseModel):
    scenario: str


class SpeedRequest(BaseModel):
    multiplier: float


class AnchorRequest(BaseModel):
    lat: float
    lon: float


@app.post("/api/simulator/anchor")
async def set_simulator_anchor(req: AnchorRequest):
    simulator.set_anchor(req.lat, req.lon)
    return {"status": "success", "lat": req.lat, "lon": req.lon}


@app.post("/api/simulator/scenario")
async def set_scenario(req: ScenarioRequest):
    allowed = ["intersection_blind", "blind_spot_overtake", "head_on_curve", "urban_traffic"]
    if req.scenario not in allowed:
        raise HTTPException(status_code=400, detail=f"Allowed scenarios: {allowed}")
    simulator.set_scenario(req.scenario)
    return {"status": "success", "scenario": req.scenario}


@app.post("/api/simulator/start")
async def start_simulator():
    simulator.start()
    return {"status": "running"}


@app.post("/api/simulator/stop")
async def stop_simulator():
    simulator.stop()
    return {"status": "paused"}


@app.post("/api/simulator/reset")
async def reset_simulator():
    simulator.reset()
    return {"status": "reset"}


@app.post("/api/simulator/speed")
async def set_simulator_speed(req: SpeedRequest):
    if req.multiplier < 0.1 or req.multiplier > 5.0:
        raise HTTPException(status_code=400, detail="Multiplier must be between 0.1 and 5.0")
    simulator.speed_multiplier = req.multiplier
    return {"status": "success", "multiplier": req.multiplier}


@app.websocket("/ws/telemetry/{vehicle_id}")
async def websocket_telemetry_endpoint(websocket: WebSocket, vehicle_id: str):
    """
    Высокоскоростной WebSocket шлюз приема телеметрии и трансляции предупреждений безопасности.
    Частота обмена: 5-10 Hz (каждые 100-200 мс).
    """
    await hub.connect(vehicle_id, websocket)
    try:
        while True:
            # Прием пакета телеметрии в формате JSON
            message_text = await websocket.receive_text()
            data = json.loads(message_text)

            # Валидация телеметрии
            telemetry = VehicleTelemetry(**data)
            telemetry.vehicle_id = vehicle_id

            # Автоматическая синхронизация окружения вокруг координат пользователя (Узбекистан / GPS)
            if abs(telemetry.lat - simulator.anchor_lat) > 0.003 or abs(telemetry.lon - simulator.anchor_lon) > 0.003:
                simulator.set_anchor(telemetry.lat, telemetry.lon)

            # Обработка пространственной фильтрации и коллизий
            safety_update = await hub.process_telemetry(telemetry)

            # Отправка ответа клиенту с ультранизкой задержкой
            await websocket.send_text(safety_update.model_dump_json())

    except WebSocketDisconnect:
        hub.disconnect(vehicle_id)
    except Exception as exc:
        hub.disconnect(vehicle_id)
