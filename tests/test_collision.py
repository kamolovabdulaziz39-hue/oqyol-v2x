"""Unit tests for V2X Collision Avoidance, TTC, CPA, and Blind Spot Detection."""
from app.models import VehicleTelemetry, SafetyLevel
from app.collision import evaluate_collision_risk, enu_to_lat_lon


def test_tbone_intersection_collision():
    """Тест: перпендикулярное сближение на перекрестке (риск столкновения)."""
    # Эго-ТС движется на Север со скоростью 54 км/ч (15 м/с), до перекрестка 45 метров (3 секунды)
    ref_lat, ref_lon = 55.751244, 37.618423
    ego_lat, ego_lon = enu_to_lat_lon(ref_lat, ref_lon, east_meters=0.0, north_meters=-45.0)
    ego = VehicleTelemetry(
        vehicle_id="EGO",
        lat=ego_lat,
        lon=ego_lon,
        speed=54.0,
        heading=0.0
    )

    # Другое ТС движется на Запад со скоростью 54 км/ч (15 м/с), до перекрестка 45 метров (3 секунды)
    oth_lat, oth_lon = enu_to_lat_lon(ref_lat, ref_lon, east_meters=45.0, north_meters=0.0)
    truck = VehicleTelemetry(
        vehicle_id="TRUCK",
        lat=oth_lat,
        lon=oth_lon,
        speed=54.0,
        heading=270.0
    )

    assessment, neighbors = evaluate_collision_risk(ego, [(truck, 63.6)])

    # Обе машины сходятся в (0,0) через ~3.0 секунды
    assert assessment.level == SafetyLevel.RED
    assert assessment.threat_vehicle_id == "TRUCK"
    assert assessment.min_ttc is not None
    assert 2.0 <= assessment.min_ttc <= 3.5
    assert assessment.recommended_speed < ego.speed


def test_safe_parallel_traffic():
    """Тест: параллельное движение в одной полосе с одинаковой скоростью."""
    ref_lat, ref_lon = 55.751244, 37.618423
    ego = VehicleTelemetry(vehicle_id="EGO", lat=ref_lat, lon=ref_lon, speed=60.0, heading=90.0)

    # Сосед едет впереди на 50 метров с той же скоростью
    other_lat, other_lon = enu_to_lat_lon(ref_lat, ref_lon, east_meters=50.0, north_meters=0.0)
    other = VehicleTelemetry(vehicle_id="LEAD", lat=other_lat, lon=other_lon, speed=60.0, heading=90.0)

    assessment, neighbors = evaluate_collision_risk(ego, [(other, 50.0)])

    # Относительная скорость нулевая, риска столкновения нет
    assert assessment.level == SafetyLevel.GREEN
    assert neighbors[0].is_threat is False


def test_diverging_traffic():
    """Тест: автомобили разъезжаются в разные стороны (отрицательный TTC)."""
    ref_lat, ref_lon = 55.751244, 37.618423
    ego = VehicleTelemetry(vehicle_id="EGO", lat=ref_lat, lon=ref_lon, speed=60.0, heading=0.0)

    # Сосед едет на Юг (удаляется)
    other_lat, other_lon = enu_to_lat_lon(ref_lat, ref_lon, east_meters=0.0, north_meters=-30.0)
    other = VehicleTelemetry(vehicle_id="BEHIND", lat=other_lat, lon=other_lon, speed=60.0, heading=180.0)

    assessment, neighbors = evaluate_collision_risk(ego, [(other, 30.0)])
    assert assessment.level == SafetyLevel.GREEN


def test_blind_spot_warning():
    """Тест: ТС находится в задней левой слепой зоне (угол ~135 град, 15 метров)."""
    ref_lat, ref_lon = 55.751244, 37.618423
    # Эго едет на Север (heading=0)
    ego = VehicleTelemetry(vehicle_id="EGO", lat=ref_lat, lon=ref_lon, speed=50.0, heading=0.0)

    # Сосед сзади-слева (West: -10m, South: -10m) -> угол относительно Севера ~225 градусов (или слепая зона)
    other_lat, other_lon = enu_to_lat_lon(ref_lat, ref_lon, east_meters=-10.0, north_meters=-10.0)
    other = VehicleTelemetry(vehicle_id="BLIND_CAR", lat=other_lat, lon=other_lon, speed=55.0, heading=0.0)

    assessment, neighbors = evaluate_collision_risk(ego, [(other, 14.1)])
    assert assessment.is_blind_spot is True
    assert assessment.level in [SafetyLevel.YELLOW, SafetyLevel.RED]
