"""V2X Collision Risk Engine: TTC, CPA, Intersection Movement Assist (IMA) and Blind Spot Detection."""
import math
from typing import List, Tuple, Optional
from app.config import settings
from app.models import (
    VehicleTelemetry,
    NeighborVehicle,
    SafetyAssessment,
    SafetyLevel,
    TrajectoryPoint
)
from app.spatial_index import METERS_PER_DEGREE_LAT, calculate_bearing


def project_lat_lon_to_enu(
    ref_lat: float, ref_lon: float, lat: float, lon: float
) -> Tuple[float, float]:
    """Преобразование координат WGS-84 в локальные касательные декартовы координаты (East, North) в метрах."""
    lat_rad = math.radians(ref_lat)
    meters_per_deg_lon = METERS_PER_DEGREE_LAT * math.cos(lat_rad)

    east_meters = (lon - ref_lon) * meters_per_deg_lon
    north_meters = (lat - ref_lat) * METERS_PER_DEGREE_LAT
    return east_meters, north_meters


def enu_to_lat_lon(
    ref_lat: float, ref_lon: float, east_meters: float, north_meters: float
) -> Tuple[float, float]:
    """Обратное преобразование из ENU (метры) в WGS-84 (lat, lon)."""
    lat_rad = math.radians(ref_lat)
    meters_per_deg_lon = METERS_PER_DEGREE_LAT * math.cos(lat_rad)

    lat = ref_lat + (north_meters / METERS_PER_DEGREE_LAT)
    lon = ref_lon + (east_meters / meters_per_deg_lon)
    return lat, lon


def velocity_components_enu(speed_kmh: float, heading_deg: float) -> Tuple[float, float]:
    """Разложение скорости на компоненты (v_east, v_north) в м/с. Heading 0 = Север, 90 = Восток."""
    speed_ms = speed_kmh / 3.6
    rad = math.radians(heading_deg)
    v_east = speed_ms * math.sin(rad)
    v_north = speed_ms * math.cos(rad)
    return v_east, v_north


def compute_future_trajectory(
    lat: float, lon: float, speed_kmh: float, heading_deg: float, horizon_sec: float = 5.0, steps: int = 5
) -> List[TrajectoryPoint]:
    """Генерация точек прогнозируемой траектории ТС на horizon_sec вперед."""
    v_east, v_north = velocity_components_enu(speed_kmh, heading_deg)
    points = []
    step_dt = horizon_sec / steps

    for i in range(1, steps + 1):
        dt = i * step_dt
        d_east = v_east * dt
        d_north = v_north * dt
        p_lat, p_lon = enu_to_lat_lon(lat, lon, d_east, d_north)
        points.append(TrajectoryPoint(lat=round(p_lat, 7), lon=round(p_lon, 7), sec_offset=round(dt, 1)))

    return points


def evaluate_collision_risk(
    ego: VehicleTelemetry,
    neighbors_raw: List[Tuple[VehicleTelemetry, float]]
) -> Tuple[SafetyAssessment, List[NeighborVehicle]]:
    """
    Анализ траекторий собственного ТС (ego) и всех окружающих ТС.
    Возвращает комплексную оценку безопасности и список обогащенных данных соседей.
    """
    ego_ve, ego_vn = velocity_components_enu(ego.speed, ego.heading)
    ego_speed_ms = ego.speed / 3.6

    evaluated_neighbors: List[NeighborVehicle] = []

    overall_level = SafetyLevel.GREEN
    alert_messages = []
    threat_vehicle_id: Optional[str] = None
    min_ttc: Optional[float] = None
    closest_dist: Optional[float] = None
    is_blind_spot_flag = False
    is_intersection_flag = False

    for other, dist_meters in neighbors_raw:
        if closest_dist is None or dist_meters < closest_dist:
            closest_dist = dist_meters

        # Переводим положение соседа в локальную систему координат относительно ego (0,0)
        xb, yb = project_lat_lon_to_enu(ego.lat, ego.lon, other.lat, other.lon)
        oth_ve, oth_vn = velocity_components_enu(other.speed, other.heading)

        # Относительная скорость (other - ego)
        d_ve = oth_ve - ego_ve
        d_vn = oth_vn - ego_vn
        rel_speed_sq = d_ve * d_ve + d_vn * d_vn

        # Вычисление относительного курсового угла
        bearing_to_other = calculate_bearing(ego.lat, ego.lon, other.lat, other.lon)
        rel_bearing = (bearing_to_other - ego.heading + 360.0) % 360.0

        # Расчет Time to CPA (t_cpa) и CPA distance (d_cpa)
        # Скалярное произведение r_rel * v_rel: (xb * d_ve + yb * d_vn)
        dot_r_v = xb * d_ve + yb * d_vn
        t_cpa: Optional[float] = None
        d_cpa: Optional[float] = None

        if rel_speed_sq > 0.04:  # отн. скорость больше ~0.2 м/с
            cand_t = -dot_r_v / rel_speed_sq
            if cand_t > 0:
                t_cpa = cand_t
                xcpa = xb + d_ve * t_cpa
                ycpa = yb + d_vn * t_cpa
                d_cpa = math.hypot(xcpa, ycpa)

        # Проверка пересечения траекторий на перекрестках (Intersection Movement Assist)
        intersection_conflict = False
        det = ego_ve * oth_vn - ego_vn * oth_ve
        if abs(det) > 0.1 and ego_speed_ms > 1.0 and (other.speed / 3.6) > 1.0:
            # Непараллельные траектории
            t_ego = (yb * oth_ve - xb * oth_vn) / det
            t_oth = (yb * ego_ve - xb * ego_vn) / det
            if 0 < t_ego < settings.PREDICTION_HORIZON_SEC and 0 < t_oth < settings.PREDICTION_HORIZON_SEC:
                if abs(t_ego - t_oth) < 1.8:  # машины окажутся в одной точке с разницей < 1.8 сек
                    intersection_conflict = True
                    is_intersection_flag = True
                    if t_cpa is None or t_ego < t_cpa:
                        t_cpa = min(t_ego, t_oth)
                        d_cpa = min(d_cpa or 999.0, 10.0)

        # Проверка опасности в слепой зоне (Blind Spot Detection)
        blind_spot_hazard = False
        is_left_blind = (
            settings.BLIND_SPOT_LEFT_DEG_RANGE[0] <= rel_bearing <= settings.BLIND_SPOT_LEFT_DEG_RANGE[1]
        )
        is_right_blind = (
            settings.BLIND_SPOT_RIGHT_DEG_RANGE[0] <= rel_bearing <= settings.BLIND_SPOT_RIGHT_DEG_RANGE[1]
        )

        if dist_meters <= settings.BLIND_SPOT_RADIUS_METERS and (is_left_blind or is_right_blind):
            # ТС в слепой зоне
            blind_spot_hazard = True
            is_blind_spot_flag = True

        # Определение уровня угрозы для конкретного ТС
        neighbor_threat_level = SafetyLevel.GREEN
        is_threat = False

        if t_cpa is not None and d_cpa is not None:
            if t_cpa <= settings.TTC_CRITICAL_SEC and d_cpa <= settings.CPA_CRITICAL_METERS:
                neighbor_threat_level = SafetyLevel.RED
                is_threat = True
            elif t_cpa <= settings.TTC_WARNING_SEC and d_cpa <= settings.CPA_WARNING_METERS:
                neighbor_threat_level = SafetyLevel.YELLOW
                is_threat = True
            elif intersection_conflict and t_cpa <= settings.TTC_CRITICAL_SEC:
                neighbor_threat_level = SafetyLevel.RED
                is_threat = True
            elif intersection_conflict:
                neighbor_threat_level = SafetyLevel.YELLOW
                is_threat = True

        # Угроза в слепой зоне
        if blind_spot_hazard:
            if dist_meters < 12.0:
                neighbor_threat_level = SafetyLevel.RED
                is_threat = True
            elif neighbor_threat_level == SafetyLevel.GREEN:
                neighbor_threat_level = SafetyLevel.YELLOW
                is_threat = True

        # Обновление минимального TTC
        if t_cpa is not None and is_threat:
            if min_ttc is None or t_cpa < min_ttc:
                min_ttc = t_cpa

        # Агрегация наивысшего уровня опасности для водителя
        if neighbor_threat_level == SafetyLevel.RED:
            overall_level = SafetyLevel.RED
            threat_vehicle_id = other.vehicle_id
            if intersection_conflict:
                alert_messages.append(f"ТРЕВОГА: Перекресток! Риск пересечения с {other.vehicle_id} (ТТС {t_cpa:.1f}с)")
            elif blind_spot_hazard:
                alert_messages.append(f"ТРЕВОГА: ТС {other.vehicle_id} в слепой зоне ({dist_meters:.0f}м)!")
            else:
                alert_messages.append(f"ТРЕВОГА: Опасное сближение с {other.vehicle_id} (ТТС {t_cpa:.1f}с)!")
        elif neighbor_threat_level == SafetyLevel.YELLOW and overall_level != SafetyLevel.RED:
            overall_level = SafetyLevel.YELLOW
            if threat_vehicle_id is None:
                threat_vehicle_id = other.vehicle_id
            if intersection_conflict:
                alert_messages.append(f"Внимание: пересечение траекторий с {other.vehicle_id}")
            elif blind_spot_hazard:
                alert_messages.append(f"Внимание: объект в слепой зоне {other.vehicle_id}")
            elif t_cpa is not None:
                alert_messages.append(f"Внимание: сближение с {other.vehicle_id} (ТТС {t_cpa:.1f}с)")

        # Генерация точек прогнозной траектории соседа
        traj_pts = compute_future_trajectory(other.lat, other.lon, other.speed, other.heading)

        evaluated_neighbors.append(
            NeighborVehicle(
                vehicle_id=other.vehicle_id,
                vehicle_type=other.vehicle_type,
                lat=other.lat,
                lon=other.lon,
                speed=other.speed,
                heading=other.heading,
                distance=round(dist_meters, 1),
                ttc=round(t_cpa, 2) if t_cpa is not None else None,
                cpa_distance=round(d_cpa, 1) if d_cpa is not None else None,
                relative_bearing=round(rel_bearing, 1),
                is_threat=is_threat,
                threat_level=neighbor_threat_level,
                trajectory=traj_pts
            )
        )

    # Расчет рекомендованной безопасной скорости
    if overall_level == SafetyLevel.RED:
        recommended_speed = max(0.0, min(ego.speed * 0.4, 25.0))
        final_msg = alert_messages[0] if alert_messages else "КРИТИЧЕСКАЯ ОПАСНОСТЬ! ЭКСТРЕННОЕ ТОРМОЖЕНИЕ!"
    elif overall_level == SafetyLevel.YELLOW:
        recommended_speed = max(20.0, min(ego.speed * 0.7, 45.0))
        final_msg = alert_messages[0] if alert_messages else "Внимание! Приближение к ТС. Сбавьте скорость."
    else:
        recommended_speed = 60.0 if ego.speed <= 60.0 else 90.0
        final_msg = "Дорога свободна. Движение на крейсерской скорости разрешено."

    assessment = SafetyAssessment(
        level=overall_level,
        alert_message=final_msg,
        recommended_speed=round(recommended_speed, 1),
        threat_vehicle_id=threat_vehicle_id,
        min_ttc=round(min_ttc, 2) if min_ttc is not None else None,
        closest_distance=round(closest_dist, 1) if closest_dist is not None else None,
        is_blind_spot=is_blind_spot_flag,
        is_intersection_risk=is_intersection_flag
    )

    return assessment, evaluated_neighbors
