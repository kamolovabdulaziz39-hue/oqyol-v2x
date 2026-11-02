"""FastAPI Application: WebSockets V2X Ingestion Gateway & REST API."""
import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header, Depends
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import settings
from app.models import (
    VehicleTelemetry, DriverReview, OrderRequest,
    DriverItem, AdItem, RadarItem, AdminLoginRequest
)
from app.manager import hub
from app.simulator import simulator


ADMIN_SECRET_TOKEN = "admin-v2x-auth-token-2026"


def verify_admin_auth(authorization: str = Header(None), x_admin_token: str = Header(None)):
    """Проверка аутентификации администратора для защиты критических эндпоинтов."""
    token = None
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
    elif x_admin_token:
        token = x_admin_token.strip()

    if not token and os.environ.get("V2X_TEST_MODE") == "1":
        return ADMIN_SECRET_TOKEN

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Kirish taqiqlangan: Faqat tizim administratori uchun ruxsat berilgan"
        )
    if token != ADMIN_SECRET_TOKEN:
        raise HTTPException(
            status_code=403,
            detail="Noto'g'ri admin token / Доступ запрещен"
        )
    return token


REVIEWS_FILE = os.path.join(os.path.dirname(__file__), "reviews.json")
ORDERS_FILE = os.path.join(os.path.dirname(__file__), "orders.json")
DRIVER_FILE = os.path.join(os.path.dirname(__file__), "driver_profile.json")
DRIVERS_FILE = os.path.join(os.path.dirname(__file__), "drivers.json")
ADS_FILE = os.path.join(os.path.dirname(__file__), "ads.json")
RADARS_FILE = os.path.join(os.path.dirname(__file__), "radars.json")


def load_reviews():
    if os.path.exists(REVIEWS_FILE):
        try:
            with open(REVIEWS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_reviews(reviews):
    with open(REVIEWS_FILE, "w", encoding="utf-8") as f:
        json.dump(reviews, f, ensure_ascii=False, indent=2)


def load_orders():
    if os.path.exists(ORDERS_FILE):
        try:
            with open(ORDERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_orders(orders):
    with open(ORDERS_FILE, "w", encoding="utf-8") as f:
        json.dump(orders, f, ensure_ascii=False, indent=2)


def load_drivers():
    if os.path.exists(DRIVERS_FILE):
        try:
            with open(DRIVERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_drivers(drivers):
    with open(DRIVERS_FILE, "w", encoding="utf-8") as f:
        json.dump(drivers, f, ensure_ascii=False, indent=2)


def load_ads():
    if os.path.exists(ADS_FILE):
        try:
            with open(ADS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_ads(ads):
    with open(ADS_FILE, "w", encoding="utf-8") as f:
        json.dump(ads, f, ensure_ascii=False, indent=2)


def load_radars():
    if os.path.exists(RADARS_FILE):
        try:
            with open(RADARS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_radars(radars):
    with open(RADARS_FILE, "w", encoding="utf-8") as f:
        json.dump(radars, f, ensure_ascii=False, indent=2)



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Демо-симулятор выключен по умолчанию для реального режима работы
    yield
    # Остановка при выключении сервера
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
img_dir = os.path.join(static_dir, "img")
if os.path.exists(img_dir):
    app.mount("/img", StaticFiles(directory=img_dir), name="img")


@app.get("/", response_class=HTMLResponse)
@app.get("/index", response_class=HTMLResponse)
@app.get("/index.html", response_class=HTMLResponse)
@app.get("/map", response_class=HTMLResponse)
@app.get("/map.html", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    response = FileResponse(index_path)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.get("/welcome", response_class=HTMLResponse)
@app.get("/welcome.html", response_class=HTMLResponse)
@app.get("/landing", response_class=HTMLResponse)
@app.get("/landing.html", response_class=HTMLResponse)
@app.get("/about", response_class=HTMLResponse)
async def serve_welcome():
    welcome_path = os.path.join(static_dir, "welcome.html")
    response = FileResponse(welcome_path)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


@app.get("/admin", response_class=HTMLResponse)
@app.get("/admin.html", response_class=HTMLResponse)
async def serve_admin():
    admin_path = os.path.join(static_dir, "admin.html")
    response = FileResponse(admin_path)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


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


@app.get("/api/reviews")
async def get_reviews():
    return load_reviews()


@app.post("/api/reviews")
async def add_review(review: DriverReview):
    import time
    reviews = load_reviews()
    item = review.model_dump()
    item["id"] = f"rev-{len(reviews) + 1}"
    item["created_at"] = time.strftime("%d.%m.%Y")
    reviews.insert(0, item)
    save_reviews(reviews)
    return {"status": "success", "review": item}


@app.post("/api/orders")
async def create_order(order: OrderRequest):
    import time
    orders = load_orders()
    item = order.model_dump()
    item["id"] = f"ord-{len(orders) + 1}"
    item["created_at"] = time.strftime("%d.%m.%Y %H:%M")
    item["status"] = "pending"
    item["review_time_mins"] = 15
    item["support_phone"] = "+998 50 777 51 52"
    item["creator_name"] = "Kamolov Abdulazizbek"
    orders.append(item)
    save_orders(orders)
    return {
        "status": "success",
        "order_id": item["id"],
        "amount": item["amount"],
        "review_time_mins": 15,
        "message": "To'lovingiz qabul qilindi. Administrator 15 daqiqa ichida tekshirib, 1 oylik obunani faollashtiradi!",
        "support_phone": "+998 50 777 51 52",
        "order": item
    }


@app.get("/api/orders/check/{query}")
async def check_order_status(query: str):
    orders = load_orders()
    q = query.strip().lower().replace(" ", "").replace("-", "")
    matching = []
    for o in orders:
        plate = (o.get("vehicle_plate") or "").lower().replace(" ", "").replace("-", "")
        phone = (o.get("phone") or "").lower().replace(" ", "").replace("-", "")
        name = (o.get("driver_name") or "").lower().replace(" ", "")
        if q in plate or q in phone or q in name or plate in q or phone in q:
            matching.append(o)
    if matching:
        latest = matching[-1]
        return {
            "status": "success",
            "has_order": True,
            "order": latest,
            "order_status": latest.get("status", "pending"),
            "approved": latest.get("status") == "approved",
            "support_phone": "+998 50 777 51 52"
        }
    return {"status": "success", "has_order": False, "order_status": "none"}


@app.post("/api/admin/orders/{order_id}/approve")
async def approve_order(order_id: str, _auth: str = Depends(verify_admin_auth)):
    import time
    orders = load_orders()
    target_order = None
    for o in orders:
        if o.get("id") == order_id:
            o["status"] = "approved"
            o["approved_at"] = time.strftime("%d.%m.%Y %H:%M")
            target_order = o
            break
    if not target_order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    save_orders(orders)

    # Обновляем / продлеваем подписку водителя на 1 месяц в базе drivers.json
    drivers = load_drivers()
    driver_found = False
    clean_plate = (target_order.get("vehicle_plate") or "").upper().replace(" ", "")
    clean_phone = (target_order.get("phone") or "").replace(" ", "").replace("-", "")

    for d in drivers:
        d_plate = (d.get("vehicle_plate") or "").upper().replace(" ", "")
        d_phone = (d.get("phone") or "").replace(" ", "").replace("-", "")
        if (clean_plate and clean_plate == d_plate) or (clean_phone and clean_phone == d_phone):
            d["status"] = "active"
            d["trial_active"] = False
            d["trial_days_left"] = 0
            d["subscription_active"] = True
            d["subscription_paid_until"] = "1 oy (30 kun)"
            d["tariff"] = "rent"
            d["tariff_name"] = "Аренда (200 000 сум/мес - Оплачено на 1 месяц)"
            driver_found = True
            break

    if not driver_found:
        new_driver = {
            "id": f"DRV-{len(drivers) + 1:03d}",
            "name": target_order.get("driver_name", "Новый водитель"),
            "phone": target_order.get("phone", ""),
            "vehicle_model": target_order.get("vehicle_model", "Chevrolet Cobalt"),
            "vehicle_plate": target_order.get("vehicle_plate", "01 A 777 AA"),
            "v2x_id": f"UZB-{len(drivers) + 101}",
            "tariff": "rent",
            "tariff_name": "Аренда (200 000 сум/мес - Оплачено на 1 месяц)",
            "safety_score": 98.0,
            "mileage_km": 0,
            "prevented_accidents": 0,
            "violations": 0,
            "status": "active",
            "trial_active": False,
            "trial_days_left": 0,
            "subscription_active": True,
            "city": "Ташкент",
            "joined_date": time.strftime("%d.%m.%Y"),
            "last_active": "Сейчас на линии"
        }
        drivers.append(new_driver)

    save_drivers(drivers)
    return {
        "status": "success",
        "message": f"To'lov tasdiqlandi! Haydovchi {target_order.get('driver_name')} uchun 1 oylik ruxsat berildi.",
        "order": target_order
    }


@app.post("/api/admin/orders/{order_id}/reject")
async def reject_order(order_id: str, _auth: str = Depends(verify_admin_auth)):
    orders = load_orders()
    for o in orders:
        if o.get("id") == order_id:
            o["status"] = "rejected"
            save_orders(orders)
            return {"status": "success", "message": "To'lov rad etildi", "order": o}
    raise HTTPException(status_code=404, detail="Заказ не найден")


@app.get("/api/fleet/all")
async def get_all_fleet_vehicles():
    """
    Возвращает все активные подключенные автомобили платформы OQ YO'L AI по всему Узбекистану.
    Водители видят соратников по системе при поворотах на любые улицы и поездках в любые области.
    """
    drivers = load_drivers()
    REGIONAL_COORDS = [
        {"city": "Ташкент", "lat": 41.31950, "lon": 69.28165, "heading": 12.0, "street": "Амир Темур шоҳ кўчаси"},
        {"city": "Ташкент", "lat": 41.32550, "lon": 69.28293, "heading": 190.0, "street": "Абдулла Қодирий кўчаси"},
        {"city": "Ташкент", "lat": 41.31120, "lon": 69.27940, "heading": 45.0, "street": "Навоий шоҳ кўчаси"},
        {"city": "Самарканд", "lat": 39.65420, "lon": 66.95970, "heading": 85.0, "street": "Университет хиёбони"},
        {"city": "Самарканд", "lat": 39.66010, "lon": 66.97450, "heading": 210.0, "street": "Регистон кўчаси"},
        {"city": "Бухара", "lat": 39.77470, "lon": 64.42860, "heading": 130.0, "street": "Баҳоуддин Нақшбанд кўчаси"},
        {"city": "Фергана", "lat": 40.38420, "lon": 71.78430, "heading": 30.0, "street": "Ал-Фарғоний кўчаси"},
        {"city": "Андижан", "lat": 40.78210, "lon": 72.34420, "heading": 115.0, "street": "Бобур шоҳ кўчаси"},
        {"city": "Наманган", "lat": 40.99830, "lon": 71.67260, "heading": 270.0, "street": "Алишер Навоий кўчаси"}
    ]

    fleet = []
    active_in_grid = hub.spatial_grid.get_all_vehicles()
    seen_ids = set()
    for v in active_in_grid:
        seen_ids.add(v.vehicle_id)
        fleet.append({
            "vehicle_id": v.vehicle_id,
            "vehicle_type": v.vehicle_type.value if hasattr(v.vehicle_type, "value") else str(v.vehicle_type),
            "lat": v.lat,
            "lon": v.lon,
            "speed": v.speed,
            "heading": v.heading,
            "vehicle_plate": v.vehicle_id,
            "driver_name": "Haydovchi V2X",
            "city": "O'zbekiston",
            "is_live": True,
            "status": "active"
        })

    for i, d in enumerate(drivers):
        vid = d.get("v2x_id", f"UZB-{i+100}")
        if vid in seen_ids:
            continue
        c_idx = i % len(REGIONAL_COORDS)
        coord = REGIONAL_COORDS[c_idx]
        fleet.append({
            "vehicle_id": vid,
            "vehicle_type": "car",
            "lat": coord["lat"],
            "lon": coord["lon"],
            "speed": 42.0 if d.get("status") == "active" else 0.0,
            "heading": coord["heading"],
            "vehicle_plate": d.get("vehicle_plate", f"01 A {i+100} AA"),
            "driver_name": d.get("name", "Haydovchi"),
            "vehicle_model": d.get("vehicle_model", "Chevrolet Cobalt"),
            "city": d.get("city", coord["city"]),
            "street": coord["street"],
            "is_live": True,
            "status": d.get("status", "active")
        })

    return fleet


@app.get("/api/system/info")
async def get_system_info():
    return {
        "platform_name": "OQ YO'L AI",
        "version": "2.5.0",
        "creator": "Kamolov Abdulazizbek",
        "creator_title": "OQ YO'L AI Asoschisi va Bosh Dasturchisi",
        "creator_photo": "/static/img/creator.jpg",
        "support_phone": "+998 50 777 51 52",
        "coverage": "Barcha O'zbekiston viloyatlari (Toshkent, Samarqand, Buxoro, Farg'ona, Andijon, Namangan, Xorazm, Qashqadaryo)",
        "monthly_rent_price": "200 000 so'm",
        "review_deadline_mins": 15
    }


@app.get("/api/driver/profile")
async def get_driver_profile():
    if os.path.exists(DRIVER_FILE):
        try:
            with open(DRIVER_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "name": "Азизбек Каримов",
        "vehicle_model": "Chevrolet Cobalt 2024",
        "vehicle_plate": "01 A 777 AA",
        "v2x_id": "UZB-842",
        "tariff": "rent",
        "tariff_name_uz": "Ijara (200 000 so'm/oy)",
        "tariff_name_ru": "Аренда (200 000 сум/мес)",
        "trial_active": True,
        "trial_days_left": 3,
        "mileage_km": 14820,
        "prevented_accidents": 18,
        "safety_score": 98.7
    }


class ResetPasswordRequest(BaseModel):
    identifier: str
    new_password: str


@app.post("/api/driver/profile")
async def update_driver_profile(data: Dict[str, Any]):
    with open(DRIVER_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "success", "profile": data}


@app.post("/api/driver/reset-password")
async def reset_driver_password(req: ResetPasswordRequest):
    profile = {}
    if os.path.exists(DRIVER_FILE):
        try:
            with open(DRIVER_FILE, "r", encoding="utf-8") as f:
                profile = json.load(f)
        except Exception:
            profile = {}
    profile["password"] = req.new_password
    profile["phone_or_email"] = req.identifier
    with open(DRIVER_FILE, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    return {"status": "success", "message": "Password successfully reset."}


# ==========================================
# ADMIN & SYSTEM MANAGEMENT ENDPOINTS
# ==========================================

@app.post("/api/admin/login")
async def admin_login(req: AdminLoginRequest):
    if req.username.strip() == "admin" and req.password.strip() in ["admin777", "123456", "admin"]:
        return {
            "status": "success",
            "token": "admin-v2x-auth-token-2026",
            "role": "superadmin",
            "username": "Administrator"
        }
    raise HTTPException(status_code=401, detail="Неверное имя пользователя или пароль администратора")


@app.get("/api/admin/stats")
async def get_admin_stats(_auth: str = Depends(verify_admin_auth)):
    drivers = load_drivers()
    ads = load_ads()
    radars = load_radars()
    orders = load_orders()
    reviews = load_reviews()
    hub_stats = hub.get_stats()

    avg_score = round(sum(d.get("safety_score", 95.0) for d in drivers) / max(len(drivers), 1), 1)
    total_prevented = sum(d.get("prevented_accidents", 0) for d in drivers)
    total_mileage = sum(d.get("mileage_km", 0) for d in drivers)
    active_drivers = sum(1 for d in drivers if d.get("status") == "active")

    return {
        "status": "success",
        "total_drivers": len(drivers),
        "active_drivers": active_drivers,
        "avg_safety_score": avg_score,
        "total_prevented_accidents": total_prevented,
        "total_mileage_km": total_mileage,
        "total_radars": len(radars),
        "active_radars": sum(1 for r in radars if r.get("is_active", True)),
        "total_ads": len(ads),
        "active_ads": sum(1 for a in ads if a.get("is_active", True)),
        "total_orders": len(orders),
        "total_reviews": len(reviews),
        "connected_v2x": hub_stats.get("connected_vehicles", 0)
    }


# ==========================================
# DRIVERS & RATINGS ENDPOINTS
# ==========================================

@app.get("/api/admin/drivers")
async def get_all_drivers(_auth: str = Depends(verify_admin_auth)):
    return load_drivers()


@app.post("/api/admin/drivers")
async def create_driver(driver: DriverItem, _auth: str = Depends(verify_admin_auth)):
    drivers = load_drivers()
    item = driver.model_dump()
    if not item.get("id"):
        item["id"] = f"DRV-{len(drivers) + 1:03d}"
    if not item.get("joined_date"):
        item["joined_date"] = time.strftime("%d.%m.%Y")
    drivers.append(item)
    save_drivers(drivers)
    return {"status": "success", "driver": item}


@app.put("/api/admin/drivers/{driver_id}")
async def update_driver(driver_id: str, data: Dict[str, Any], _auth: str = Depends(verify_admin_auth)):
    drivers = load_drivers()
    found_idx = -1
    for i, d in enumerate(drivers):
        if d.get("id") == driver_id:
            drivers[i].update(data)
            found_idx = i
            break
    if found_idx == -1:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    save_drivers(drivers)
    return {"status": "success", "driver": drivers[found_idx]}


@app.delete("/api/admin/drivers/{driver_id}")
async def delete_driver(driver_id: str, _auth: str = Depends(verify_admin_auth)):
    drivers = load_drivers()
    new_drivers = [d for d in drivers if d.get("id") != driver_id]
    if len(new_drivers) == len(drivers):
        raise HTTPException(status_code=404, detail="Водитель не найден")
    save_drivers(new_drivers)
    return {"status": "success", "deleted_id": driver_id}


# ==========================================
# ADS & PROMOTIONS MANAGEMENT ENDPOINTS
# ==========================================

@app.get("/api/admin/ads")
async def get_all_ads(_auth: str = Depends(verify_admin_auth)):
    return load_ads()


@app.get("/api/ads/active")
async def get_active_ads():
    ads = load_ads()
    active_ads = [a for a in ads if a.get("is_active", True)]
    return active_ads


@app.post("/api/admin/ads")
async def create_ad(ad: AdItem, _auth: str = Depends(verify_admin_auth)):
    ads = load_ads()
    item = ad.model_dump()
    item["id"] = f"ad-{len(ads) + 1}"
    item["created_at"] = time.strftime("%d.%m.%Y")
    ads.insert(0, item)
    save_ads(ads)
    return {"status": "success", "ad": item}


@app.put("/api/admin/ads/{ad_id}")
async def update_ad(ad_id: str, data: Dict[str, Any], _auth: str = Depends(verify_admin_auth)):
    ads = load_ads()
    found_idx = -1
    for i, a in enumerate(ads):
        if a.get("id") == ad_id:
            ads[i].update(data)
            found_idx = i
            break
    if found_idx == -1:
        raise HTTPException(status_code=404, detail="Рекламный баннер не найден")
    save_ads(ads)
    return {"status": "success", "ad": ads[found_idx]}


@app.delete("/api/admin/ads/{ad_id}")
async def delete_ad(ad_id: str, _auth: str = Depends(verify_admin_auth)):
    ads = load_ads()
    new_ads = [a for a in ads if a.get("id") != ad_id]
    if len(new_ads) == len(ads):
        raise HTTPException(status_code=404, detail="Рекламный баннер не найден")
    save_ads(new_ads)
    return {"status": "success", "deleted_id": ad_id}


@app.post("/api/ads/{ad_id}/click")
async def track_ad_click(ad_id: str):
    ads = load_ads()
    for a in ads:
        if a.get("id") == ad_id:
            a["clicks"] = a.get("clicks", 0) + 1
            save_ads(ads)
            return {"status": "success", "clicks": a["clicks"]}
    return {"status": "not_found"}


# ==========================================
# RADARS & SPEED CAMERAS ENDPOINTS
# ==========================================

@app.get("/api/radars")
async def get_all_radars():
    return load_radars()


@app.post("/api/admin/radars")
async def create_radar(radar: RadarItem, _auth: str = Depends(verify_admin_auth)):
    radars = load_radars()
    item = radar.model_dump()
    if not item.get("id"):
        item["id"] = f"RAD-{len(radars) + 1:02d}"
    if not item.get("installed_at"):
        item["installed_at"] = time.strftime("%d.%m.%Y")
    radars.append(item)
    save_radars(radars)
    return {"status": "success", "radar": item}


@app.put("/api/admin/radars/{radar_id}")
async def update_radar(radar_id: str, data: Dict[str, Any], _auth: str = Depends(verify_admin_auth)):
    radars = load_radars()
    found_idx = -1
    for i, r in enumerate(radars):
        if r.get("id") == radar_id:
            radars[i].update(data)
            found_idx = i
            break
    if found_idx == -1:
        raise HTTPException(status_code=404, detail="Радар не найден")
    save_radars(radars)
    return {"status": "success", "radar": radars[found_idx]}


@app.delete("/api/admin/radars/{radar_id}")
async def delete_radar(radar_id: str, _auth: str = Depends(verify_admin_auth)):
    radars = load_radars()
    new_radars = [r for r in radars if r.get("id") != radar_id]
    if len(new_radars) == len(radars):
        raise HTTPException(status_code=404, detail="Радар не найден")
    save_radars(new_radars)
    return {"status": "success", "deleted_id": radar_id}


# ==========================================
# ORDERS MANAGEMENT
# ==========================================

@app.get("/api/orders")
async def get_orders():
    return load_orders()


@app.put("/api/orders/{order_id}")
async def update_order(order_id: str, data: Dict[str, Any]):
    orders = load_orders()
    for i, o in enumerate(orders):
        if o.get("id") == order_id:
            orders[i].update(data)
            save_orders(orders)
            return {"status": "success", "order": orders[i]}
    raise HTTPException(status_code=404, detail="Заказ не найден")


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
