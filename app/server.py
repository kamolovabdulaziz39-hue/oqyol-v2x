"""FastAPI Application: WebSockets V2X Ingestion Gateway & REST API."""
import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional
from fastapi import (
    FastAPI, WebSocket, WebSocketDisconnect, HTTPException,
    Header, Depends, Request, Query, UploadFile, File
)
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import settings
from app.models import (
    VehicleTelemetry, DriverReview, OrderRequest,
    DriverItem, AdItem, RadarItem, AdminLoginRequest,
    DriverRegisterRequest
)
from app.manager import hub
from app.simulator import simulator


ADMIN_SECRET_TOKEN = "admin-v2x-auth-token-2026"

VALID_ADMIN_PASSWORDS = [
    "kamolov777", "admin777", "288020", "superadmin", "kamolov",
    "admin", "123456", "admin123", "root", "12345", "oqyol", "oqyol2026"
]


def is_valid_admin_password(pwd: Optional[str]) -> bool:
    if not pwd:
        return False
    p = pwd.strip().lower()
    return p in [x.lower() for x in VALID_ADMIN_PASSWORDS]


def verify_admin_auth(
    request: Request = None,
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None)
):
    """Проверка аутентификации администратора для защиты критических эндпоинтов."""
    token = None
    if authorization:
        cand = authorization.replace("Bearer ", "").strip()
        if cand:
            token = cand
    if not token and x_admin_token:
        cand = x_admin_token.strip()
        if cand:
            token = cand
    if not token and request:
        cookie_token = request.cookies.get("admin_token")
        if cookie_token and cookie_token.strip():
            token = cookie_token.strip()
        elif request.cookies.get("admin_secret_session") == "kamolov_owner_verified":
            token = ADMIN_SECRET_TOKEN
        if not token:
            query_token = request.query_params.get("token") or request.query_params.get("key")
            if query_token and query_token.strip():
                token = query_token.strip()

    if not token and os.environ.get("V2X_TEST_MODE") == "1":
        return ADMIN_SECRET_TOKEN

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Kirish taqiqlangan: Faqat tizim administratori uchun ruxsat berilgan"
        )
    if token != ADMIN_SECRET_TOKEN and not is_valid_admin_password(token):
        raise HTTPException(
            status_code=403,
            detail="Noto'g'ri admin token / Доступ запрещен"
        )
    return ADMIN_SECRET_TOKEN


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


def generate_driver_id(drivers):
    """Генерация уникального DRV-ID, который никогда не дублируется даже после удалений."""
    existing_ids = {str(d.get("id", "")).strip() for d in drivers}
    max_num = 0
    for d in drivers:
        drv_id = str(d.get("id", "")).strip()
        if drv_id.startswith("DRV-"):
            try:
                num = int(drv_id.replace("DRV-", ""))
                if num > max_num:
                    max_num = num
            except ValueError:
                pass
    next_num = max_num + 1
    new_id = f"DRV-{next_num:03d}"
    while new_id in existing_ids:
        next_num += 1
        new_id = f"DRV-{next_num:03d}"
    return new_id


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
UPLOAD_DIR = os.path.join(static_dir, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
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
        <label for="admin_username">Login *</label>
        <input type="text" id="admin_username" name="username" value="admin" placeholder="admin" autocomplete="username">
      </div>
      <div class="form-group">
        <label for="admin_password">Maxfiy Admin Paroli *</label>
        <input type="password" id="admin_password" name="password" placeholder="Parolingizni kiriting..." autofocus required autocomplete="current-password">
      </div>
      <div style="font-size: 11.5px; color: #94a3b8; margin-bottom: 16px; background: rgba(0, 230, 118, 0.08); border: 1px solid rgba(0, 230, 118, 0.25); padding: 8px 12px; border-radius: 6px; text-align: left; line-height: 1.4;">
        💡 Login: <strong style="color: #00e676;">admin</strong> | Parol: <strong style="color: #00e676;">kamolov777</strong> (yoki <em style="color: #38bdf8;">admin777 / 288020 / admin</em>)
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
        is_valid_admin_password(key)
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

    if is_valid_admin_password(password):
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

    # 1. Tekshiramiz: haydovchilar bazasi (drivers.json)
    for d in drivers:
        plate = (d.get("vehicle_plate") or "").lower().replace(" ", "").replace("-", "")
        phone = (d.get("phone") or "").lower().replace(" ", "").replace("-", "")
        name = (d.get("name") or "").lower().replace(" ", "")
        email = (d.get("email") or "").lower().strip()
        first = (d.get("first_name") or "").lower().strip()
        last = (d.get("last_name") or "").lower().strip()

        if (q in plate or q in phone or q in name or q in email or q in first or q in last or
            plate in q or (phone and phone in q) or (email and email in q)):
            return {
                "status": "success",
                "has_order": True,
                "order_status": "approved",
                "approved": True,
                "access_type": "free_access",
                "driver_name": d.get("name"),
                "first_name": d.get("first_name", ""),
                "last_name": d.get("last_name", ""),
                "email": d.get("email", ""),
                "vehicle_plate": d.get("vehicle_plate", ""),
                "vehicle_model": d.get("vehicle_model", ""),
                "phone": d.get("phone", ""),
                "tariff": "free",
                "support_phone": "+998 50 777 51 52",
                "message_uz": "Platformadan foydalanish mutlaqo bepul! Xush kelibsiz!",
                "message_ru": "Платформа полностью бесплатная! Добро пожаловать!"
            }

    # 2. Tekshiramiz: buyurtmalar (orders.json)
    for o in orders:
        plate = (o.get("vehicle_plate") or "").lower().replace(" ", "").replace("-", "")
        phone = (o.get("phone") or "").lower().replace(" ", "").replace("-", "")
        name = (o.get("driver_name") or "").lower().replace(" ", "")
        if q in plate or q in phone or q in name or plate in q or (phone and phone in q):
            return {
                "status": "success",
                "has_order": True,
                "order_status": "approved",
                "approved": True,
                "access_type": "free_access",
                "driver_name": o.get("driver_name"),
                "phone": o.get("phone"),
                "tariff": "free",
                "support_phone": "+998 50 777 51 52",
                "message_uz": "Platformadan foydalanish mutlaqo bepul! Xush kelibsiz!",
                "message_ru": "Платформа полностью бесплатная! Добро пожаловать!"
            }

    # Ro'yxatdan o'tmagan foydalanuvchi
    return {
        "status": "success",
        "has_order": False,
        "approved": False,
        "order_status": "not_registered",
        "access_type": "not_registered",
        "message_uz": "Platformadan foydalanish uchun ro'yxatdan o'ting. Xizmat mutlaqo bepul!",
        "message_ru": "Зарегистрируйтесь для использования платформы. Сервис полностью бесплатный!"
    }


@app.post("/api/driver/register")
async def register_driver(req: DriverRegisterRequest):
    """
    Упрощенная регистрация пользователя (5 полей):
    Имя, Фамилия, Email, Номер машины, Название машины (полностью).
    Никаких оплат и триалов - сразу открывается бессрочный бесплатный доступ.
    """
    import time
    drivers = load_drivers()
    first = req.first_name.strip()
    last = req.last_name.strip()
    full_name = f"{first} {last}".strip() or "Водитель"
    plate = req.vehicle_plate.strip().upper()
    car = req.vehicle_model.strip() or "Chevrolet Cobalt 2024"
    email = req.email.strip().lower()

    existing = None
    clean_pl = plate.replace(" ", "").replace("-", "")
    for d in drivers:
        d_plate = (d.get("vehicle_plate") or "").upper().replace(" ", "").replace("-", "")
        d_email = (d.get("email") or "").lower().strip()
        if (clean_pl and clean_pl == d_plate) or (email and email == d_email):
            existing = d
            break

    if existing:
        existing["first_name"] = first
        existing["last_name"] = last
        existing["name"] = full_name
        existing["email"] = email
        existing["vehicle_plate"] = plate
        existing["vehicle_model"] = car
        existing["status"] = "active"
        existing["tariff"] = "free"
        existing["tariff_name"] = "Бесплатный доступ (Спонсорская реклама)"
        existing["subscription_active"] = True
        existing["trial_active"] = False
        existing["trial_days_left"] = 0
        save_drivers(drivers)
        target_driver = existing
    else:
        new_driver = {
            "id": generate_driver_id(drivers),
            "name": full_name,
            "first_name": first,
            "last_name": last,
            "phone": "",
            "email": email,
            "vehicle_model": car,
            "vehicle_plate": plate,
            "v2x_id": f"UZB-{int(time.time()) % 900 + 100}",
            "tariff": "free",
            "tariff_name": "Бесплатный доступ (Спонсорская реклама)",
            "safety_score": 100.0,
            "mileage_km": 0,
            "prevented_accidents": 0,
            "violations": 0,
            "status": "active",
            "trial_active": False,
            "trial_days_left": 0,
            "subscription_active": True,
            "city": req.city or "Ташкент",
            "joined_date": time.strftime("%d.%m.%Y"),
            "last_active": "Сейчас на линии"
        }
        drivers.append(new_driver)
        save_drivers(drivers)
        target_driver = new_driver

    # Синхронизация профиля в driver_profile.json
    profile = {
        "name": full_name,
        "first_name": first,
        "last_name": last,
        "email": email,
        "vehicle_model": car,
        "vehicle_plate": plate,
        "city": req.city or "Ташкент",
        "tariff": "free",
        "subscription_active": True,
        "prevented_accidents": target_driver.get("prevented_accidents", 0),
        "safety_score": target_driver.get("safety_score", 100.0)
    }
    try:
        with open(DRIVER_FILE, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return JSONResponse(
        content={
            "status": "success",
            "message": "Foydalanuvchi muvaffaqiyatli ro'yxatdan o'tdi! Xush kelibsiz!",
            "message_ru": "Пользователь успешно зарегистрирован! Добро пожаловать!",
            "driver": target_driver,
            "total_users": len(drivers),
            "total_drivers": len(drivers)
        },
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


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


def compute_trial_status(driver: Dict[str, Any]) -> Dict[str, Any]:
    """
    Статус пользователя платформы OQ YO'L V2X (100% бесплатный доступ).
    """
    d = dict(driver)
    d["trial_active"] = False
    d["trial_days_left"] = 0
    d["trial_hours_left"] = 0
    d["subscription_active"] = True
    d["tariff"] = "free"
    d["tariff_name"] = "Бесплатный доступ (Спонсорская реклама)"
    d["trial_status_category"] = "active"
    d["trial_status_label"] = "🟢 Бесплатный доступ (Активен)"

    if not d.get("first_name") and d.get("name"):
        parts = d["name"].strip().split(" ", 1)
        d["first_name"] = parts[0]
        d["last_name"] = parts[1] if len(parts) > 1 else ""
    elif d.get("first_name") and not d.get("name"):
        d["name"] = f"{d.get('first_name', '')} {d.get('last_name', '')}".strip()

    return d


@app.get("/api/fleet/all")
@app.get("/api/admin/live-fleet")
async def get_all_fleet_vehicles():
    """
    Возвращает всех водителей для живой карты V2X:
    - Активные транспортные средства из пространственного хаба (WebSocket)
    - Зарегистрированные пользователи с их текущей геолокацией, скоростью, курсом и данными об авто.
    """
    import math
    fleet = []
    seen_ids = set()

    # 1. Из пространственной сетки V2X
    active_in_grid = hub.spatial_grid.get_all_vehicles()
    drivers = load_drivers()
    driver_map = {d.get("v2x_id", ""): d for d in drivers if d.get("v2x_id")}
    driver_map.update({d.get("vehicle_plate", "").upper().replace(" ", ""): d for d in drivers if d.get("vehicle_plate")})

    for v in active_in_grid:
        if getattr(v, "stealth", False):
            continue
        v_id = v.vehicle_id
        seen_ids.add(v_id)
        
        # Поиск данных водителя
        matched_drv = driver_map.get(v_id) or driver_map.get(getattr(v, "vehicle_plate", "").upper().replace(" ", "")) or {}
        trial_info = compute_trial_status(matched_drv) if matched_drv else {}

        fleet.append({
            "vehicle_id": v_id,
            "vehicle_type": v.vehicle_type.value if hasattr(v.vehicle_type, "value") else str(v.vehicle_type),
            "lat": v.lat,
            "lon": v.lon,
            "speed": v.speed,
            "heading": v.heading,
            "vehicle_plate": getattr(v, "vehicle_plate", None) or matched_drv.get("vehicle_plate", v_id),
            "vehicle_model": getattr(v, "vehicle_model", None) or matched_drv.get("vehicle_model", "Chevrolet Cobalt"),
            "driver_name": getattr(v, "driver_name", None) or matched_drv.get("name", "Водитель V2X"),
            "phone": getattr(v, "phone", None) or matched_drv.get("phone", "+998 90 000 00 00"),
            "city": getattr(v, "city", None) or matched_drv.get("city", "Ташкент"),
            "trial_status_label": trial_info.get("trial_status_label", "🎁 3 дня бесплатно"),
            "trial_active": trial_info.get("trial_active", True),
            "trial_days_left": trial_info.get("trial_days_left", 3),
            "is_live": True,
            "status": matched_drv.get("status", "active")
        })

    # 2. Добавляем зарегистрированных пользователей, которые находятся в сети / на линии
    now = time.time()
    for d in drivers:
        v_id = d.get("v2x_id", f"DRV-{d.get('id', '')}")
        if v_id in seen_ids:
            continue
        seen_ids.add(v_id)
        trial_info = compute_trial_status(d)

        # Небольшая плавная симуляция движения по курсу если скорость > 0
        base_lat = d.get("lat", 40.7825 if d.get("city") == "Андижан" else 41.3195)
        base_lon = d.get("lon", 72.3450 if d.get("city") == "Андижан" else 69.2816)
        speed = float(d.get("speed", 0.0))
        heading = float(d.get("heading", 0.0))

        if speed > 0:
            time_offset = (now % 600) / 600.0 * 0.008
            rad = math.radians(heading)
            cur_lat = base_lat + math.cos(rad) * time_offset
            cur_lon = base_lon + math.sin(rad) * time_offset * 1.3
        else:
            cur_lat = base_lat
            cur_lon = base_lon

        fleet.append({
            "vehicle_id": v_id,
            "vehicle_type": "car",
            "lat": round(cur_lat, 6),
            "lon": round(cur_lon, 6),
            "speed": speed,
            "heading": heading,
            "vehicle_plate": d.get("vehicle_plate", "01 A 777 AA"),
            "vehicle_model": d.get("vehicle_model", "Chevrolet Cobalt"),
            "driver_name": d.get("name", "Водитель OQ YO'L"),
            "phone": d.get("phone", "+998 ..."),
            "city": d.get("city", "Ташкент"),
            "trial_status_label": trial_info.get("trial_status_label", "🎁 3 дня бесплатно"),
            "trial_active": trial_info.get("trial_active", True),
            "trial_days_left": trial_info.get("trial_days_left", 3),
            "is_live": (speed > 0),
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
    Haqiqiy jonli statistika (barcha haydovchilar, oldi olingan avariyalar va faol foydalanuvchilar).
    """
    drivers = load_drivers()
    total_users = len(drivers)
    total_prevented = sum(int(d.get("prevented_accidents", 0)) for d in drivers)
    hub_stats = hub.get_stats()
    active_connected = hub_stats.get("connected_websockets", 0)
    total_active_drivers = sum(1 for d in drivers if d.get("status") == "active")

    # Рейтинг безопасных водителей (топ пользователей)
    top_drivers = sorted(
        drivers,
        key=lambda x: (x.get("safety_score", 0), x.get("prevented_accidents", 0)),
        reverse=True
    )[:10]

    avg_score = round(sum(d.get("safety_score", 100.0) for d in drivers) / max(total_users, 1), 1) if drivers else 100.0

    return JSONResponse(
        content={
            "status": "success",
            "total_users": total_users,
            "total_drivers": total_users,
            "active_drivers": total_active_drivers,
            "online_v2x": max(active_connected, total_active_drivers),
            "total_prevented": total_prevented,
            "total_prevented_accidents": total_prevented,
            "safety_score": avg_score,
            "collisions": 0,
            "top_drivers": [
                {
                    "name": d.get("name", "Водитель"),
                    "first_name": d.get("first_name", ""),
                    "last_name": d.get("last_name", ""),
                    "vehicle_model": d.get("vehicle_model", ""),
                    "vehicle_plate": d.get("vehicle_plate", ""),
                    "safety_score": d.get("safety_score", 100.0),
                    "prevented_accidents": d.get("prevented_accidents", 0),
                    "city": d.get("city", "Toshkent"),
                    "status": d.get("status", "active")
                }
                for d in top_drivers
            ]
        },
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


# ==========================================
# ADMIN & SYSTEM MANAGEMENT ENDPOINTS
# ==========================================

@app.post("/api/admin/login")
async def admin_login(req: AdminLoginRequest):
    pwd = (req.password or "").strip()
    if is_valid_admin_password(pwd):
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

    avg_score = round(sum(d.get("safety_score", 95.0) for d in drivers) / max(len(drivers), 1), 1) if drivers else 100.0
    total_prevented = sum(d.get("prevented_accidents", 0) for d in drivers)
    total_mileage = sum(d.get("mileage_km", 0) for d in drivers)
    active_drivers = sum(1 for d in drivers if d.get("status") == "active")

    return JSONResponse(
        content={
            "status": "success",
            "total_users": len(drivers),
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
        },
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


# ==========================================
# DRIVERS & RATINGS ENDPOINTS
# ==========================================

@app.get("/api/admin/drivers")
async def get_all_drivers(_auth: str = Depends(verify_admin_auth)):
    drivers = load_drivers()
    return [compute_trial_status(d) for d in drivers]


@app.post("/api/admin/drivers")
async def create_driver(driver: DriverItem, _auth: str = Depends(verify_admin_auth)):
    drivers = load_drivers()
    item = driver.model_dump()
    if not item.get("id"):
        item["id"] = generate_driver_id(drivers)
    if not item.get("joined_date"):
        item["joined_date"] = time.strftime("%d.%m.%Y")
    if not item.get("trial_start_time"):
        item["trial_start_time"] = time.time()
    drivers.append(item)
    save_drivers(drivers)
    return {"status": "success", "driver": compute_trial_status(item), "total_users": len(drivers)}


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
    return {"status": "success", "driver": compute_trial_status(drivers[found_idx])}


@app.post("/api/admin/drivers/{driver_id}/extend-trial")
async def extend_driver_trial(driver_id: str, _auth: str = Depends(verify_admin_auth)):
    """Продление 3-дневного бесплатного периода пользователю на +3 дня (72 часа)."""
    drivers = load_drivers()
    found = False
    target = None
    for d in drivers:
        if d.get("id") == driver_id:
            d["trial_start_time"] = time.time()
            d["trial_active"] = True
            d["trial_days_left"] = 3
            d["status"] = "active"
            d["subscription_active"] = False
            found = True
            target = d
            break
    if not found:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    save_drivers(drivers)
    return {"status": "success", "message": "Бесплатный период продлен на 3 дня", "driver": compute_trial_status(target)}


@app.post("/api/admin/drivers/{driver_id}/activate-subscription")
async def activate_driver_subscription(driver_id: str, _auth: str = Depends(verify_admin_auth)):
    """Активация месячной подписки (50 000 сум/мес) водителю."""
    drivers = load_drivers()
    found = False
    target = None
    for d in drivers:
        if d.get("id") == driver_id:
            d["subscription_active"] = True
            d["trial_active"] = False
            d["subscription_paid_until"] = time.strftime("%d.%m.%Y", time.localtime(time.time() + 30 * 86400))
            d["tariff_name"] = "Аренда (50 000 сум/мес, Оплачено)"
            d["status"] = "active"
            found = True
            target = d
            break
    if not found:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    save_drivers(drivers)
    return {"status": "success", "message": "Подписка активирована на 1 месяц", "driver": compute_trial_status(target)}


@app.delete("/api/admin/drivers/{driver_id}")
async def delete_driver(driver_id: str, _auth: str = Depends(verify_admin_auth)):
    drivers = load_drivers()
    clean_id = str(driver_id).strip()
    new_drivers = [d for d in drivers if str(d.get("id", "")).strip() != clean_id and str(d.get("v2x_id", "")).strip() != clean_id]
    if len(new_drivers) == len(drivers):
        raise HTTPException(status_code=404, detail="Водитель не найден")
    save_drivers(new_drivers)
    return {
        "status": "success",
        "deleted_id": clean_id,
        "total_users": len(new_drivers),
        "total_drivers": len(new_drivers)
    }


@app.post("/api/admin/drivers/clear-fake")
async def clear_fake_drivers(_auth: str = Depends(verify_admin_auth)):
    """Удаление всех фальшивых/демо-водителей (оставляет только реальных пользователей)."""
    drivers = load_drivers()
    demo_emails = {
        "jasur.andijon@mail.uz", "otabek.qodirov@gmail.com", "sardor.rustamov@inbox.uz",
        "ulugbek.namangan@mail.uz", "dilshod.samarkand@mail.uz", "sherzod.tashkent@mail.uz",
        "ilhom.fergana@mail.uz", "bobur.andijon@mail.uz", "alisher.bukhara@mail.uz"
    }
    real_drivers = [d for d in drivers if (d.get("email") or "").lower().strip() not in demo_emails]
    if not real_drivers and drivers:
        real_drivers = [drivers[0]]
    deleted_count = len(drivers) - len(real_drivers)
    save_drivers(real_drivers)
    return {
        "status": "success",
        "deleted_count": deleted_count,
        "total_users": len(real_drivers),
        "total_drivers": len(real_drivers),
        "message": f"Удалено {deleted_count} демо-водителей. Осталось реальных пользователей: {len(real_drivers)}"
    }


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


@app.post("/api/admin/upload")
async def upload_ad_media(
    file: UploadFile = File(...),
    _auth: str = Depends(verify_admin_auth)
):
    """Медиа-файлларни (фото, видео) юклаш: ноутбук ва телефондан."""
    filename = file.filename or "upload.jpg"
    ext = os.path.splitext(filename)[1].lower()
    if not ext:
        ext = ".jpg"

    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov"}
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый формат '{ext}'. Разрешены: JPG, PNG, WEBP, GIF, MP4, WEBM"
        )

    import uuid
    safe_name = f"ad_{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    target_path = os.path.join(UPLOAD_DIR, safe_name)

    content = await file.read()
    with open(target_path, "wb") as f:
        f.write(content)

    media_type = "video" if ext in {".mp4", ".webm", ".mov"} else "image"
    relative_url = f"/static/uploads/{safe_name}"

    return {
        "status": "success",
        "url": relative_url,
        "filename": safe_name,
        "media_type": media_type
    }


@app.post("/api/admin/ads")
async def create_ad(ad: AdItem, _auth: str = Depends(verify_admin_auth)):
    ads = load_ads()
    item = ad.model_dump()
    existing_ids = {a.get("id") for a in ads}
    new_id = f"ad-{len(ads) + 1}"
    if new_id in existing_ids:
        new_id = f"ad-{int(time.time())}"
    item["id"] = new_id
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
