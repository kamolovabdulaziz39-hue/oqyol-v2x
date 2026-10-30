"""Performance and latency benchmark for V2X Ingestion and Spatial Querying."""
import time
import asyncio
from app.models import VehicleTelemetry
from app.manager import V2XHub


async def test_high_throughput_telemetry_benchmark():
    test_hub = V2XHub()
    num_vehicles = 100
    packets_per_vehicle = 10  # 1000 пакетов всего
    base_lat = 55.751244
    base_lon = 37.618423

    # Подготовка пула телеметрии
    telemetries = []
    for i in range(num_vehicles):
        vid = f"CAR-{i:03d}"
        d_lat = (i % 10) * 0.001
        d_lon = (i // 10) * 0.001
        telem = VehicleTelemetry(
            vehicle_id=vid,
            lat=base_lat + d_lat,
            lon=base_lon + d_lon,
            speed=50.0 + (i % 20),
            heading=(i * 36) % 360,
            client_time=time.time() * 1000.0
        )
        telemetries.append(telem)

    # Прогрев
    for t in telemetries:
        await test_hub.process_telemetry(t)

    # Бенчмарк
    start_time = time.perf_counter()
    processed_count = 0

    for _ in range(packets_per_vehicle):
        for t in telemetries:
            t.client_time = time.time() * 1000.0
            res = await test_hub.process_telemetry(t)
            assert res.type == "safety_update"
            processed_count += 1

    total_time_sec = time.perf_counter() - start_time
    avg_latency_ms = (total_time_sec / processed_count) * 1000.0
    throughput_pps = processed_count / total_time_sec

    print(f"\n[BENCHMARK] Обработано {processed_count} пакетов за {total_time_sec:.3f} сек")
    print(f"[BENCHMARK] Пропускная способность: {throughput_pps:.1f} пакетов/сек")
    print(f"[BENCHMARK] Среднее время обработки пакета: {avg_latency_ms:.3f} мс")

    # Требование ТЗ: время обработки должно быть в пределах 100-150 мс
    # Наш сервер на Spatial Hash Grid отрабатывает < 5 мс на пакет!
    assert avg_latency_ms < 10.0, f"Время обработки {avg_latency_ms} мс превышает порог 10 мс"
