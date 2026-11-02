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


class DriverReview(BaseModel):
    id: Optional[str] = None
    driver_name: str
    vehicle_model: str = "Chevrolet Cobalt"
    vehicle_plate: str = "01 A 777 AA"
    city: str = "Toshkent"
    rating: int = 5
    text: str
    video_url: Optional[str] = None
    created_at: Optional[str] = None
    verified_v2x: bool = True


class OrderRequest(BaseModel):
    order_type: str = "rent"  # "rent" (200 000 so'm / oy, 3 kun bepul sinov)
    driver_name: str          # Исм Фамилия (масалан: Азизбек Каримов)
    phone: str                # Телефон рақами (+998 90 123-45-67)
    vehicle_plate: str = "01 A 777 AA" # Мошина рақами
    vehicle_model: str = "Chevrolet Cobalt"
    payment_method: str = "card" # "card" (Uzcard / Humo) ёки "cash" (Нақд пул)
    card_number: Optional[str] = "" # Тўлов қилинган карта рақами
    amount: str = "200 000 so'm"
    status: str = "pending"   # "pending" (15 дақиқалик текширувда), "approved", "rejected"
    comments: Optional[str] = None
    created_at: Optional[str] = None
    approved_at: Optional[str] = None
    review_time_mins: int = 15
    support_phone: str = "+998 50 777 51 52"
    creator_name: str = "Kamolov Abdulazizbek"


class DriverItem(BaseModel):
    id: Optional[str] = None
    name: str
    phone: str
    email: Optional[str] = ""
    vehicle_model: str = "Chevrolet Cobalt 2024"
    vehicle_plate: str = "01 A 777 AA"
    v2x_id: Optional[str] = "UZB-100"
    tariff: str = "rent"
    tariff_name: Optional[str] = "Аренда (200 000 сум/мес)"
    safety_score: float = 98.5
    mileage_km: int = 10000
    prevented_accidents: int = 10
    violations: int = 0
    status: str = "active"
    trial_active: bool = True
    trial_days_left: int = 3
    city: Optional[str] = "Ташкент"
    joined_date: Optional[str] = None
    last_active: Optional[str] = "Сейчас на линии"


class AdItem(BaseModel):
    id: Optional[str] = None
    title: str
    text: str
    badge: Optional[str] = "АКЦИЯ"
    image_emoji: Optional[str] = "📢"
    link_url: Optional[str] = "#"
    button_text: Optional[str] = "Подробнее"
    is_active: bool = True
    placement: Optional[str] = "top_banner"
    duration_sec: int = 25  # Длительность показа от 10 сек до 120 сек (2 мин)
    impressions: Optional[int] = 0
    clicks: Optional[int] = 0
    created_at: Optional[str] = None


class RadarItem(BaseModel):
    id: Optional[str] = None
    name: str
    lat: float
    lon: float
    speed_limit: int = 60
    type: Optional[str] = "speed_camera"
    type_name: Optional[str] = "Контроль скорости"
    description: Optional[str] = ""
    is_active: bool = True
    city: Optional[str] = "Ташкент"
    direction: Optional[str] = "Оба направления"
    installed_at: Optional[str] = None


class AdminLoginRequest(BaseModel):
    username: str
    password: str


