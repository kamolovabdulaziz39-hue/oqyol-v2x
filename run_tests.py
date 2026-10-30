"""Test runner using standard library."""
import asyncio
import time
from tests.test_spatial import (
    test_haversine_and_bearing,
    test_spatial_grid_update_and_query,
    test_stealth_mode_filtering,
    test_vehicle_removal
)
from tests.test_collision import (
    test_tbone_intersection_collision,
    test_safe_parallel_traffic,
    test_diverging_traffic,
    test_blind_spot_warning
)
from tests.test_benchmark import test_high_throughput_telemetry_benchmark

def run_all():
    print("=" * 60)
    print(" Running V2X Test Suite")
    print("=" * 60)

    # 1. Spatial tests
    print("Running spatial index tests...")
    test_haversine_and_bearing()
    test_spatial_grid_update_and_query()
    test_stealth_mode_filtering()
    test_vehicle_removal()
    print(" [OK] Spatial index tests passed.")

    # 2. Collision tests
    print("Running collision & trajectory tests...")
    test_tbone_intersection_collision()
    test_safe_parallel_traffic()
    test_diverging_traffic()
    test_blind_spot_warning()
    print(" [OK] Collision and TTC tests passed.")

    # 3. Benchmark
    print("Running high-throughput benchmark...")
    asyncio.run(test_high_throughput_telemetry_benchmark())
    print(" [OK] Benchmark passed.")

    print("\n" + "=" * 60)
    print(" ALL TESTS & BENCHMARKS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_all()
