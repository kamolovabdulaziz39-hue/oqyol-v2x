"""Configuration settings for V2X Cooperative Road Safety Navigation System."""
import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    HOST: str = "0.0.0.0"
    PORT: int = int(os.environ.get("PORT", 8085))
    AUTO_OPEN_BROWSER: bool = (os.environ.get("RENDER") is None and os.environ.get("PORT") is None)
    
    # V2X Spatial Parameters
    AWARENESS_RADIUS_METERS: float = 2000.0   # Радиус взаимного обнаружения (1-3 км)
    SPATIAL_GRID_CELL_SIZE_METERS: float = 500.0 # Размер ячейки пространственного индекса
    
    # Telemetry Parameters
    TELEMETRY_HZ_TARGET: float = 10.0         # Частота отправки телеметрии (5-10 Hz)
    STALE_VEHICLE_TIMEOUT_SEC: float = 5.0    # Таймаут удаления неактивных ТС
    MAX_ACCEPTABLE_LATENCY_MS: float = 150.0  # Максимально допустимая задержка по ТЗ (100-150 мс)
    
    # Trajectory & Collision Risk Parameters
    PREDICTION_HORIZON_SEC: float = 7.0       # Горизонт прогнозирования траекторий
    
    # CPA (Closest Point of Approach) & TTC (Time to Collision) Thresholds
    TTC_CRITICAL_SEC: float = 3.2             # Критическое время до столкновения (< 3.2 сек)
    TTC_WARNING_SEC: float = 6.0              # Предупреждающее время (< 6.0 сек)
    
    CPA_CRITICAL_METERS: float = 15.0         # Критическая дистанция сближения (< 15 метров)
    CPA_WARNING_METERS: float = 35.0          # Предупреждающая дистанция сближения (< 35 метров)
    
    # Blind Spot Parameters (слепые зоны)
    BLIND_SPOT_RADIUS_METERS: float = 25.0    # Радиус опасности в слепой зоне
    BLIND_SPOT_LEFT_DEG_RANGE: tuple = (100.0, 160.0)
    BLIND_SPOT_RIGHT_DEG_RANGE: tuple = (200.0, 260.0)

    # Tariffs & Promotion Settings (3 kun bepul, 200 000 so'm/oy)
    TRIAL_FREE_DAYS: int = 3                  # 3 дня бесплатного периода
    MONTHLY_RENTAL_PRICE_UZS: int = 200_000   # Новая сниженная цена аренды (200 000 сум)
    OLD_MONTHLY_RENTAL_PRICE_UZS: int = 1_000_000 # Старая цена для отображения скидки 80%

    # Smart Advertising Parameters (10s to 120s, no driver disruption)
    AD_MIN_DURATION_SEC: int = 10             # Минимальная длительность рекламы (10 сек)
    AD_MAX_DURATION_SEC: int = 120            # Максимальная длительность рекламы (2 мин / 120 сек)
    AD_DEFAULT_DURATION_SEC: int = 25         # Стандартная длительность рекламы (25 сек)
    AD_SAFETY_MUTE_SPEED_KMH: float = 30.0    # Скорость при которой реклама переходит в тихий мини-режим

settings = Settings()
