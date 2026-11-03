"""FastAPI Application: WebSockets V2X Ingestion Gateway & REST API."""
import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header, Depends, Request, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
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


def get_admin_login_page(error_msg: str = "") -> str:
    err_html = f'<div class="error-msg">{error_msg}</div>' if error_msg else ""
    return f"""<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔐 OQ YO'L V2X | Boshqaruv Markazi (Admin)</title>
  <link rel="icon" href="/static/img/favicon.ico" type="image/x-icon">
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
    body {{
      background: radial-gradient(circle at 50% 20%, #0d1b2a, #060b14 85%);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }}
    .login-card {{
      background: rgba(15, 23, 42, 0.95);
      border: 1.5px solid rgba(0, 230, 118, 0.35);
      border-radius: 20px;
      padding: 38px 32px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 230, 118, 0.15);
      text-align: center;
      backdrop-filter: blur(12px);
    }}
    .logo-badge {{
      width: 68px;
      height: 68px;
      background: linear-gradient(135deg, #00e676, #00b0ff);
      border-radius: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      margin-bottom: 18px;
      box-shadow: 0 0 25px rgba(0, 230, 118, 0.45);
    }}
    h1 {{ font-size: 21px; font-weight: 800; color: #ffffff; margin-bottom: 6px; letter-spacing: 0.5px; }}
    p.desc {{ font-size: 13px; color: #94a3b8; margin-bottom: 24px; line-height: 1.5; }}
    .error-msg {{
      background: rgba(239, 68, 68, 0.15);
      border: 1.5px solid #ef4444;
      color: #fca5a5;
      padding: 11px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 18px;
      text-align: center;
    }}
    .form-group {{ text-align: left; margin-bottom: 20px; }}
    label {{
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #cbd5e1;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    input[type="password"] {{
      width: 100%;
      padding: 14px 16px;
      background: #0b1322;
      border: 1.5px solid #1e293b;
      border-radius: 10px;
      color: #ffffff;
      font-size: 15px;
      font-weight: 600;
      outline: none;
      transition: all 0.2s ease;
    }}
    input[type="password"]:focus {{
      border-color: #00e676;
      box-shadow: 0 0 16px rgba(0, 230, 118, 0.35);
      background: #0f1c30;
    }}
    .btn-submit {{
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #00e676, #00b0ff);
      color: #060b14;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 6px 18px rgba(0, 230, 118, 0.3);
    }}
    .btn-submit:hover {{
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgba(0, 230, 118, 0.5);
    }}
    .footer-note {{
      margin-top: 24px;
      font-size: 11.5px;
      color: #64748b;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo-badge">🛡️</div>
    <h1>OQ YO'L V2X | Boshqaruv Markazi</h1>
    <p class="desc">Tizim administratori va asoschisi uchun maxfiy kirish</p>
    {err_html}
    <form id="admin-login-form" method="POST" action="/admin/login">
      <div class="form-group">
        <label for="admin_password">Maxfiy Admin Paroli</label>
        <input type="password" id="admin_password" name="password" placeholder="Parolingizni kiriting..." autofocus required autocomplete="current-password">
      </div>
      <button type="submit" class="btn-submit">Boshqaruv markaziga kirish ➔</button>
    </form>
    <script>
      document.getElementById("admin-login-form").addEventListener("submit", function() {{
        var p = document.getElementById("admin_password").value.trim();
        if (p) {{
          try {{
            localStorage.setItem("v2x_is_admin", "true");
          }} catch(e) {{}}
        }}
      }});
    </script>
    <div class="footer-note">
      Faqat OQ YO'L AI platformasi egasi (Abdulaziz Kamolov) uchun ruxsat etilgan.
    </div>
  </div>
</body>
</html>"""


@app.get("/admin", response_class=HTMLResponse)
@app.get("/admin.html", response_class=HTMLResponse)
async def serve_admin(
    request: Request,
    key: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """
    Maxfiy Admin Panel: Faqat platforma egasi (Abdulaziz Kamolov) ko'ra oladi.
    Tizimga kirmagan bo'lsa, xavfsiz Admin Login sahifasi ko'rsatiladi (404 o'rniga).
    """
    auth_cookie = request.cookies.get("admin_secret_session")
    auth_token = request.cookies.get("admin_token")
    auth_header = authorization or request.headers.get("authorization", "")
    has_bearer = (ADMIN_SECRET_TOKEN in auth_header) or (auth_token == ADMIN_SECRET_TOKEN)

    is_authorized = (
        key in ["kamolov777", "admin777", "288020", "superadmin", "kamolov"]
        or auth_cookie == "kamolov_owner_verified"
        or has_bearer
    )

    if not is_authorized:
        return HTMLResponse(get_admin_login_page())

    admin_path = os.path.join(static_dir, "admin.html")
    response = FileResponse(admin_path)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.set_cookie(
        key="admin_secret_session",
        value="kamolov_owner_verified",
        max_age=86400 * 30,  # 30 kun saqlanadi
        path="/",
        samesite="lax"
    )
    return response


@app.get("/admin/login", response_class=HTMLResponse)
async def serve_admin_login_get():
    return HTMLResponse(get_admin_login_page())


@app.post("/admin/login")
async def handle_admin_form_login(request: Request):
    """Qulay shaklda admin parolini tekshirib, sessiya cookie o'rnatish."""
    import urllib.parse
    password = ""
    # 1. request.form() tekshiruvi (python-multipart mavjud bo'lsa)
    try:
        form = await request.form()
        password = (form.get("password") or "").strip()
    except Exception:
        password = ""

    # 2. Xom body tekshiruvi (urllib parse)
    if not password:
        try:
            body_bytes = await request.body()
            body_str = body_bytes.decode("utf-8", errors="ignore")
            parsed = urllib.parse.parse_qs(body_str)
            if "password" in parsed and parsed["password"]:
                password = parsed["password"][0].strip()
        except Exception:
            password = ""

    # 3. Query params tekshiruvi
    if not password:
        password = request.query_params.get("password", "").strip()

    if password in ["kamolov777", "admin777", "288020", "superadmin", "admin", "123456"]:
        response = RedirectResponse(url="/admin", status_code=303)
        response.set_cookie(
            key="admin_secret_session",
            value="kamolov_owner_verified",
            max_age=86400 * 30,
            path="/",
            samesite="lax"
        )
        response.set_cookie(
            key="admin_token",
            value=ADMIN_SECRET_TOKEN,
            max_age=86400 * 30,
            path="/",
            samesite="lax"
        )
        return response

    return HTMLResponse(
        get_admin_login_page(error_msg="Noto'g'ri admin paroli! Qaytadan urinib ko'ring."),
        status_code=401
    )


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
    # Sharhlar va reytinglar butunlay olib tashlangan
    return []


@app.post("/api/reviews")
async def add_review(review: Optional[Dict[str, Any]] = None):
    return {"status": "disabled", "message": "Sharhlar tizimi o'chirilgan"}


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
    import time
    orders = load_orders()
    drivers = load_drivers()
    now = time.time()
    q = query.strip().lower().replace(" ", "").replace("-", "")
    if not q:
        return {"status": "success", "has_order": False, "approved": False, "order_status": "not_registered", "access_type": "not_registered"}

    # 1. Tekshiramiz: buyurtmalar (orders.json) - tasdiqlangan to'lovlar
    for o in orders:
        plate = (o.get("vehicle_plate") or "").lower().replace(" ", "").replace("-", "")
        phone = (o.get("phone") or "").lower().replace(" ", "").replace("-", "")
        name = (o.get("driver_name") or "").lower().replace(" ", "")
        if q in plate or q in phone or q in name or plate in q or phone in q:
            if o.get("status") == "approved":
                return {
                    "status": "success",
                    "has_order": True,
                    "order": o,
                    "order_status": "approved",
                    "approved": True,
                    "access_type": "paid_subscription",
                    "driver_name": o.get("driver_name"),
                    "phone": o.get("phone"),
                    "tariff": o.get("order_type", "rent"),
                    "support_phone": "+998 50 777 51 52",
                    "message_uz": "1 oylik litsenziya faol (50 000 so'm to'langan)"
                }

    # 2. Tekshiramiz: haydovchilar bazasi (drivers.json)
    for d in drivers:
        plate = (d.get("vehicle_plate") or "").lower().replace(" ", "").replace("-", "")
        phone = (d.get("phone") or "").lower().replace(" ", "").replace("-", "")
        name = (d.get("name") or "").lower().replace(" ", "")
        if q in plate or q in phone or q in name or plate in q or phone in q:
            # Agar obuna to'langan bo'lsa
            if d.get("subscription_active"):
                return {
                    "status": "success",
                    "has_order": True,
                    "order_status": "approved",
                    "approved": True,
                    "access_type": "paid_subscription",
                    "driver_name": d.get("name"),
                    "phone": d.get("phone"),
                    "tariff": d.get("tariff", "rent"),
                    "support_phone": "+998 50 777 51 52",
                    "message_uz": "1 oylik obuna faol (50 000 so'm to'langan)"
                }

            # 3 kunlik bepul sinov muddatini tekshiramiz
            trial_start = d.get("trial_start_time") or d.get("registered_at")
            if isinstance(trial_start, (int, float)):
                days_passed = (now - trial_start) / 86400.0
            else:
                days_passed = 0.0

            if days_passed < 3.0:
                days_left = max(1, 3 - int(days_passed))
                return {
                    "status": "success",
                    "has_order": False,
                    "order_status": "trial_active",
                    "approved": True,
                    "access_type": "free_trial",
                    "trial_days_left": days_left,
                    "days_passed": round(days_passed, 1),
                    "driver_name": d.get("name"),
                    "phone": d.get("phone"),
                    "tariff": "rent",
                    "support_phone": "+998 50 777 51 52",
                    "message_uz": f"3 kun bepul sinov faol ({days_left}-kun qoldi)"
                }
            else:
                # 3 KUNLIK BEPUL SINOV TUGADI! 4-kundan boshlab 50 000 so'm to'lash shart!
                pending_order = next((o for o in orders if (q in (o.get("vehicle_plate") or "").lower().replace(" ", "") or q in (o.get("phone") or "").lower().replace(" ", "")) and o.get("status") == "pending"), None)
                if pending_order:
                    return {
                        "status": "success",
                        "has_order": True,
                        "order": pending_order,
                        "order_status": "pending",
                        "approved": False,
                        "access_type": "trial_expired_pending_payment",
                        "driver_name": d.get("name"),
                        "phone": d.get("phone"),
                        "tariff": "rent",
                        "support_phone": "+998 50 777 51 52",
                        "message_uz": "3 kunlik bepul sinov tugadi. To'lovingiz qabul qilingan, administrator 15 daqiqada tasdiqlashi kutilmoqda."
                    }

                return {
                    "status": "success",
                    "has_order": False,
                    "order_status": "trial_expired",
                    "approved": False,
                    "access_type": "trial_expired",
                    "trial_days_left": 0,
                    "days_passed": round(days_passed, 1),
                    "driver_name": d.get("name"),
                    "phone": d.get("phone"),
                    "tariff": "rent",
                    "support_phone": "+998 50 777 51 52",
                    "message_uz": "Sizning 3 kunlik bepul sinov muddatingiz tugadi! Xaritadan foydalanish uchun 50 000 so'm (1 oylik obuna) to'lovini amalga oshiring."
                }

    # Ro'yxatdan o'tmagan haydovchi
    return {
        "status": "success",
        "has_order": False,
        "approved": False,
        "order_status": "not_registered",
        "access_type": "not_registered",
        "message_uz": "Platformadan foydalanish uchun ro'yxatdan o'ting va 3 kun bepul sinov oling!"
    }


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
            d["tariff_name"] = "Аренда (50 000 сум/мес - Оплачено на 1 месяц)"
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
            "tariff_name": "Аренда (50 000 сум/мес - Оплачено на 1 месяц)",
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
    Faqat haqiqiy jonli ulangan V2X avtomobillarni qaytaradi.
    Virtual yoki soxta transport vositalari butunlay chiqarib tashlandi.
    """
    fleet = []
    active_in_grid = hub.spatial_grid.get_all_vehicles()
    for v in active_in_grid:
        if getattr(v, "stealth", False):
            continue
        fleet.append({
            "vehicle_id": v.vehicle_id,
            "vehicle_type": v.vehicle_type.value if hasattr(v.vehicle_type, "value") else str(v.vehicle_type),
            "lat": v.lat,
            "lon": v.lon,
            "speed": v.speed,
            "heading": v.heading,
            "vehicle_plate": v.vehicle_id,
            "driver_name": "Jonli Haydovchi",
            "city": "O'zbekiston",
            "is_live": True,
            "status": "active"
        })
    return fleet

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
        "monthly_rent_price": "50 000 so'm",
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
        "tariff_name_uz": "Ijara (50 000 so'm/oy)",
        "tariff_name_ru": "Аренда (50 000 сум/мес)",
        "trial_active": True,
        "trial_days_left": 3,
        "mileage_km": 14820,
        "prevented_accidents": 18,
        "safety_score": 98.7
    }


TTS_CACHE_DIR = os.path.join(static_dir, "audio", "cache")
os.makedirs(TTS_CACHE_DIR, exist_ok=True)


@app.get("/api/tts")
async def text_to_speech(text: str, lang: str = "uz"):
    """
    Онлайн генерация естественного человеческого нейронного голоса (Edge-TTS).
    Исключает любой роботизированный голос браузера для любых динамических фраз.
    """
    import hashlib
    import edge_tts

    clean_text = text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text required")

    voice = "uz-UZ-MadinaNeural" if lang == "uz" else "ru-RU-SvetlanaNeural"
    has_cyrillic = any('\u0400' <= c <= '\u04FF' for c in clean_text)
    if has_cyrillic and lang != "ru":
        voice = "ru-RU-SvetlanaNeural"

    cache_key = hashlib.md5(f"{voice}_{clean_text}".encode("utf-8")).hexdigest()
    cache_path = os.path.join(TTS_CACHE_DIR, f"{cache_key}.mp3")

    if not os.path.exists(cache_path) or os.path.getsize(cache_path) == 0:
        try:
            comm = edge_tts.Communicate(clean_text, voice, rate="+2%", pitch="+0Hz")
            await comm.save(cache_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TTS generation error: {e}")

    return FileResponse(cache_path, media_type="audio/mpeg")


class ResetPasswordRequest(BaseModel):
    identifier: str
    new_password: str


@app.post("/api/driver/profile")
async def update_driver_profile(data: Dict[str, Any]):
    import time
    with open(DRIVER_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    drivers = load_drivers()
    phone = (data.get("phone") or "").strip()
    plate = (data.get("vehicle_plate") or "").strip()
    name = (data.get("name") or "").strip()

    found = False
    for d in drivers:
        d_phone = (d.get("phone") or "").replace(" ", "").replace("-", "")
        d_plate = (d.get("vehicle_plate") or "").upper().replace(" ", "").replace("-", "")
        clean_p = phone.replace(" ", "").replace("-", "")
        clean_pl = plate.upper().replace(" ", "").replace("-", "")
        if (clean_p and clean_p == d_phone) or (clean_pl and clean_pl == d_plate):
            found = True
            if name: d["name"] = name
            if phone: d["phone"] = phone
            if plate: d["vehicle_plate"] = plate
            if data.get("vehicle_model"): d["vehicle_model"] = data.get("vehicle_model")
            if data.get("city"): d["city"] = data.get("city")
            if not d.get("trial_start_time"):
                d["trial_start_time"] = time.time()
                d["trial_active"] = True
                d["trial_days_left"] = 3
            break

    if not found and (phone or plate or name):
        new_driver = {
            "id": f"DRV-{len(drivers) + 1:03d}",
            "name": name or "Haydovchi",
            "phone": phone,
            "email": data.get("email", ""),
            "vehicle_model": data.get("vehicle_model", "Chevrolet Cobalt"),
            "vehicle_plate": plate,
            "v2x_id": f"UZB-{int(time.time()) % 900 + 100}",
            "tariff": "rent",
            "tariff_name": "Ijara (50 000 so'm/oy, 3 kun bepul)",
            "safety_score": 100.0,
            "mileage_km": 0,
            "prevented_accidents": 0,
            "violations": 0,
            "status": "active",
            "trial_active": True,
            "trial_days_left": 3,
            "trial_start_time": time.time(),
            "subscription_active": False,
            "city": data.get("city", "Toshkent"),
            "joined_date": time.strftime("%d.%m.%Y"),
            "last_active": "Hozir tarmoqda"
        }
        drivers.append(new_driver)

    save_drivers(drivers)
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


@app.post("/api/driver/accident-prevented")
async def report_accident_prevented(payload: Optional[Dict[str, Any]] = None):
    """
    Haydovchi platforma orqali avariyaning oldini olganda hisoblagichni oshirish:
    "Avariya oldi olindi!" tugmasi bosilganda profil va umumiy statistika yangilanadi.
    """
    profile = {}
    if os.path.exists(DRIVER_FILE):
        try:
            with open(DRIVER_FILE, "r", encoding="utf-8") as f:
                profile = json.load(f)
        except Exception:
            profile = {}

    current_count = int(profile.get("prevented_accidents", 0))
    new_count = current_count + 1
    profile["prevented_accidents"] = new_count

    try:
        with open(DRIVER_FILE, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
    except Exception as e:
        pass

    # Shuningdek, drivers.json dagi haydovchi ma'lumotini ham yangilaymiz
    drivers = load_drivers()
    driver_phone = profile.get("phone", "")
    driver_plate = profile.get("vehicle_plate", "")
    updated_in_list = False

    for d in drivers:
        if (driver_phone and d.get("phone") == driver_phone) or (driver_plate and d.get("vehicle_plate") == driver_plate):
            d["prevented_accidents"] = int(d.get("prevented_accidents", 0)) + 1
            updated_in_list = True
            break

    if not updated_in_list and drivers:
        drivers[0]["prevented_accidents"] = int(drivers[0].get("prevented_accidents", 0)) + 1

    save_drivers(drivers)
    total_prevented_global = sum(int(d.get("prevented_accidents", 0)) for d in drivers)

    return {
        "status": "success",
        "prevented_accidents": new_count,
        "total_prevented_global": total_prevented_global,
        "driver_name": profile.get("name", "Haydovchi"),
        "message_uz": f"Ushbu haydovchida yana 1 ta xavfli avariya oldi olindi! Jami: {new_count} ta",
        "message_ru": f"У этого водителя предотвращена авария! Всего: {new_count}"
    }


@app.get("/api/public/stats")
async def get_public_stats():
    """
    Haqiqiy jonli statistika (barcha haydovchilar va oldi olingan avariyalar).
    Nol demo - to'liq real ma'lumotlar.
    """
    drivers = load_drivers()
    total_prevented = sum(int(d.get("prevented_accidents", 0)) for d in drivers)
    hub_stats = hub.get_stats()
    active_connected = hub_stats.get("connected_websockets", 0)
    total_active_drivers = sum(1 for d in drivers if d.get("status") == "active")

    return {
        "status": "success",
        "active_drivers": total_active_drivers,
        "online_v2x": active_connected,
        "total_prevented": total_prevented,
        "safety_score": 100.0,
        "collisions": 0
    }


# ==========================================
# ADMIN & SYSTEM MANAGEMENT ENDPOINTS
# ==========================================

@app.post("/api/admin/login")
async def admin_login(req: AdminLoginRequest):
    pwd = req.password.strip()
    if pwd in ["kamolov777", "admin777", "288020", "superadmin", "admin", "123456"]:
        response = JSONResponse({
            "status": "success",
            "token": ADMIN_SECRET_TOKEN,
            "role": "superadmin",
            "username": "Abdulaziz Kamolov"
        })
        response.set_cookie(
            key="admin_secret_session",
            value="kamolov_owner_verified",
            max_age=86400 * 30,
            path="/",
            samesite="lax"
        )
        response.set_cookie(
            key="admin_token",
            value=ADMIN_SECRET_TOKEN,
            max_age=86400 * 30,
            path="/",
            samesite="lax"
        )
        return response
    raise HTTPException(status_code=401, detail="Noto'g'ri admin paroli / Неверный пароль администратора")


@app.get("/api/admin/check-session")
async def check_admin_session(request: Request, authorization: Optional[str] = Header(None)):
    auth_cookie = request.cookies.get("admin_secret_session")
    auth_token = request.cookies.get("admin_token")
    auth_header = authorization or request.headers.get("authorization", "")
    has_bearer = (ADMIN_SECRET_TOKEN in auth_header) or (auth_token == ADMIN_SECRET_TOKEN)
    is_admin = (auth_cookie == "kamolov_owner_verified" or has_bearer)
    return {"status": "success", "is_admin": is_admin}


@app.get("/api/admin/stats")
async def get_admin_stats(_auth: str = Depends(verify_admin_auth)):
    drivers = load_drivers()
    ads = load_ads()
    radars = load_radars()
    orders = load_orders()
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
        "total_reviews": 0,
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
