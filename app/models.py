"""Data models and schemas for V2X telematics and collision warning."""
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class SafetyLevel(str, Enum):
    GREEN = "GREEN"      # Путь свободен, безопасный режим
    YELLOW = "YELLOW"    # Внимание: потенциальный конфликт траекторий
    RED = "RED"          # ТРЕВОГА: критическая опасность столкновения


class VehicleType(str, Enum):
    CAR = "car"
    TRUCK = "truck"
    BUS = "bus"
    MOTORCYCLE = "motorcycle"
    EMERGENCY = "emergency"


class TrajectoryPoint(BaseModel):
    lat: float
    lon: float
    sec_offset: float


class VehicleTelemetry(BaseModel):
    vehicle_id: str = Field(..., description="Уникальный идентификатор ТС")
    vehicle_type: VehicleType = Field(default=VehicleType.CAR, description="Тип ТС")
    lat: float = Field(..., description="Широта (GPS/ГЛОНАСС)")
    lon: float = Field(..., description="Долгота (GPS/ГЛОНАСС)")
    speed: float = Field(default=0.0, description="Скорость в км/ч")
    heading: float = Field(default=0.0, description="Азимут/курс (0-359.9 градусов)")
    elevation: float = Field(default=0.0, description="Высота над уровнем моря")
    stealth: bool = Field(default=False, description="Режим невидимки (не передавать свои геоданные другим)")
    client_time: float = Field(default=0.0, description="Метка времени на клиенте (мс)")


class NeighborVehicle(BaseModel):
    vehicle_id: str
    vehicle_type: VehicleType
    lat: float
    lon: float
    speed: float
    heading: float
    distance: float = Field(..., description="Расстояние в метрах")
    ttc: Optional[float] = Field(default=None, description="Time to Collision (сек)")
    cpa_distance: Optional[float] = Field(default=None, description="Расстояние в точке максимального сближения (м)")
    relative_bearing: float = Field(default=0.0, description="Относительный угол (градусы)")
    is_threat: bool = False
    threat_level: SafetyLevel = SafetyLevel.GREEN
    trajectory: List[TrajectoryPoint] = Field(default_factory=list)


class SafetyAssessment(BaseModel):
    level: SafetyLevel = SafetyLevel.GREEN
    alert_message: str = "Дорога свободна. Движение в крейсерском режиме."
    recommended_speed: float = 60.0
    threat_vehicle_id: Optional[str] = None
    min_ttc: Optional[float] = None
    closest_distance: Optional[float] = None
    is_blind_spot: bool = False
    is_intersection_risk: bool = False


class SafetyUpdate(BaseModel):
    type: str = "safety_update"
    server_time: float
    client_time: float
    rtt_ms: float = 0.0
    own_vehicle: VehicleTelemetry
    safety: SafetyAssessment
    neighbors: List[NeighborVehicle]
