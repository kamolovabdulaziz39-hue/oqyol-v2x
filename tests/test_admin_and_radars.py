"""Test suite for Admin Panel, Drivers, Ads, and Radar Stations endpoints."""
import os
import unittest
from fastapi.testclient import TestClient
from app.server import app


class TestAdminAndRadars(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.client.headers.update({"Authorization": "Bearer admin-v2x-auth-token-2026"})

    def test_admin_login(self):
        # Valid login
        res = self.client.post("/api/admin/login", json={"username": "admin", "password": "admin777"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "success")

        # Invalid login
        bad_res = self.client.post("/api/admin/login", json={"username": "admin", "password": "wrongpassword"})
        self.assertEqual(bad_res.status_code, 401)

    def test_admin_stats(self):
        res = self.client.get("/api/admin/stats")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_drivers", data)
        self.assertIn("total_radars", data)
        self.assertIn("total_ads", data)
        self.assertIn("avg_safety_score", data)
        self.assertGreater(data["total_drivers"], 0)
        self.assertGreater(data["total_radars"], 0)

    def test_drivers_crud(self):
        # Get all drivers
        res = self.client.get("/api/admin/drivers")
        self.assertEqual(res.status_code, 200)
        drivers = res.json()
        self.assertIsInstance(drivers, list)
        self.assertGreater(len(drivers), 0)

        # Check driver structure (ratings, plate, etc.)
        first = drivers[0]
        self.assertIn("name", first)
        self.assertIn("safety_score", first)
        self.assertIn("vehicle_plate", first)

        # Create new driver
        new_drv = {
            "name": "Тестовый Водитель",
            "phone": "+998 90 000-00-00",
            "email": "test@v2x.uz",
            "vehicle_model": "Chevrolet Tracker",
            "vehicle_plate": "01 T 111 TT",
            "tariff": "rent",
            "safety_score": 97.5,
            "mileage_km": 5000,
            "prevented_accidents": 3,
            "status": "active"
        }
        res_create = self.client.post("/api/admin/drivers", json=new_drv)
        self.assertEqual(res_create.status_code, 200)
        created_id = res_create.json()["driver"]["id"]

        # Update driver
        res_update = self.client.put(f"/api/admin/drivers/{created_id}", json={"safety_score": 99.0})
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["driver"]["safety_score"], 99.0)

        # Delete driver
        res_del = self.client.delete(f"/api/admin/drivers/{created_id}")
        self.assertEqual(res_del.status_code, 200)

    def test_ads_crud(self):
        # Get active ads
        res_active = self.client.get("/api/ads/active")
        self.assertEqual(res_active.status_code, 200)
        active_ads = res_active.json()
        self.assertIsInstance(active_ads, list)

        # Create ad
        new_ad = {
            "title": "Скидка 15% на мойку V2X",
            "text": "Для всех водителей платформы OQ YO'L",
            "badge": "СПЕЦПРЕДЛОЖЕНИЕ",
            "image_emoji": "🏎️",
            "link_url": "https://example.com/wash",
            "button_text": "Записаться",
            "is_active": True
        }
        res_create = self.client.post("/api/admin/ads", json=new_ad)
        self.assertEqual(res_create.status_code, 200)
        ad_id = res_create.json()["ad"]["id"]

        # Click tracking
        res_click = self.client.post(f"/api/ads/{ad_id}/click")
        self.assertEqual(res_click.status_code, 200)
        self.assertEqual(res_click.json()["clicks"], 1)

        # Toggle inactive
        res_toggle = self.client.put(f"/api/admin/ads/{ad_id}", json={"is_active": False})
        self.assertEqual(res_toggle.status_code, 200)
        self.assertFalse(res_toggle.json()["ad"]["is_active"])

        # Delete ad
        res_del = self.client.delete(f"/api/admin/ads/{ad_id}")
        self.assertEqual(res_del.status_code, 200)

    def test_radars_crud(self):
        # Get radars
        res = self.client.get("/api/radars")
        self.assertEqual(res.status_code, 200)
        radars = res.json()
        self.assertIsInstance(radars, list)
        self.assertGreater(len(radars), 0)

        # Check radar properties
        first = radars[0]
        self.assertIn("name", first)
        self.assertIn("lat", first)
        self.assertIn("lon", first)
        self.assertIn("speed_limit", first)

        # Create new radar
        new_radar = {
            "name": "Тестовый радар Автоураган",
            "lat": 41.3300,
            "lon": 69.2900,
            "speed_limit": 70,
            "type": "speed_camera",
            "type_name": "Контроль скорости",
            "is_active": True
        }
        res_create = self.client.post("/api/admin/radars", json=new_radar)
        self.assertEqual(res_create.status_code, 200)
        radar_id = res_create.json()["radar"]["id"]

        # Update radar speed limit
        res_update = self.client.put(f"/api/admin/radars/{radar_id}", json={"speed_limit": 60})
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["radar"]["speed_limit"], 60)

        # Delete radar
        res_del = self.client.delete(f"/api/admin/radars/{radar_id}")
        self.assertEqual(res_del.status_code, 200)

    def test_admin_page_served(self):
        res = self.client.get("/admin")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/html", res.headers["content-type"])
        self.assertIn("Панель Администратора", res.text)


if __name__ == "__main__":
    unittest.main()
