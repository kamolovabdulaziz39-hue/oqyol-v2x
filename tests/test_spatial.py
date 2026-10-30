"""Tests for Spatial Hash Grid Indexing."""
from app.models import VehicleTelemetry, VehicleType
from app.spatial_index import SpatialHashGrid, haversine_distance, calculate_bearing


def test_haversine_and_bearing():
    # Москва, Красная площадь и Кремль (~500м)
    lat1, lon1 = 55.7539, 37.6208
    lat2, lon2 = 55.7512, 37.6184
    dist = haversine_distance(lat1, lon1, lat2, lon2)
    assert 300 < dist < 500

    bearing = calculate_bearing(lat1, lon1, lat2, lon2)
    assert 180 <= bearing <= 270  # Направление на юго-запад


def test_spatial_grid_update_and_query():
    grid = SpatialHashGrid(cell_size_meters=500.0)

    # Добавляем центральное ТС
    ego = VehicleTelemetry(
        vehicle_id="EGO",
        lat=55.7500,
        lon=37.6180,
        speed=60.0,
        heading=0.0
    )
    grid.update_vehicle(ego)

    # Добавляем соседа в 300 метрах
    near_car = VehicleTelemetry(
        vehicle_id="NEAR",
        lat=55.7525,
        lon=37.6180,
        speed=50.0,
        heading=180.0
    )
    grid.update_vehicle(near_car)

    # Добавляем далекое ТС в 5 километрах
    far_car = VehicleTelemetry(
        vehicle_id="FAR",
        lat=55.7950,
        lon=37.6180,
        speed=50.0,
        heading=180.0
    )
    grid.update_vehicle(far_car)

    # Запрос радиуса 1000 метров
    results = grid.query_radius(ego.lat, ego.lon, radius_meters=1000.0, exclude_vehicle_id="EGO")
    result_ids = [v[0].vehicle_id for v in results]

    assert "NEAR" in result_ids
    assert "FAR" not in result_ids
    assert len(results) == 1


def test_stealth_mode_filtering():
    grid = SpatialHashGrid(cell_size_meters=500.0)

    stealth_car = VehicleTelemetry(
        vehicle_id="GHOST",
        lat=55.7502,
        lon=37.6180,
        speed=40.0,
        heading=90.0,
        stealth=True
    )
    grid.update_vehicle(stealth_car)

    # По умолчанию скрытые ТС исключаются из выдачи
    res = grid.query_radius(55.7500, 37.6180, radius_meters=1000.0, exclude_stealth=True)
    assert len(res) == 0

    # Если exclude_stealth=False (например, для оперативных служб)
    res_all = grid.query_radius(55.7500, 37.6180, radius_meters=1000.0, exclude_stealth=False)
    assert len(res_all) == 1
    assert res_all[0][0].vehicle_id == "GHOST"


def test_vehicle_removal():
    grid = SpatialHashGrid(cell_size_meters=500.0)
    car = VehicleTelemetry(vehicle_id="C1", lat=55.75, lon=37.61, speed=20.0, heading=0.0)
    grid.update_vehicle(car)
    assert grid.total_active_vehicles() == 1

    grid.remove_vehicle("C1")
    assert grid.total_active_vehicles() == 0
    assert len(grid.query_radius(55.75, 37.61, 1000.0)) == 0
