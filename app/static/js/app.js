/**
 * Main V2X Application Controller (Uzbekistan / Tashkent & Real GPS Integration).
 * Handles WebSocket telemetry pipeline, live geolocation, bilingual UI (Russian / Uzbek),
 * automotive human voice AI, and realistic vehicle models.
 */

class V2XApp {
  constructor() {
    this.vehicleId = "UZB-" + Math.floor(100 + Math.random() * 900);
    this.ws = null;
    this.sendInterval = null;
    this.telemetryHz = 10;
    this.lang = "uz"; // По умолчанию: узбекский язык (O'zbekcha)

    // Начальные координаты: Ташкент, Узбекистан (Сквер Амира Темура)
    this.ego = {
      lat: 41.311081,
      lon: 69.279737,
      speed: 48.0,     // км/ч
      heading: 0.0,    // 0 = Север
      stealth: false,
      isMoving: true
    };

    this.gpsMode = false;
    this.gpsWatchId = null;
    this.lastGpsTimestamp = null;
    this.lastGpsCoords = null;
    this.hudMirror = false;
    this.isPaused = false;
    this.rtt = 0;

    // Словари интерфейса на узбекском и русском языках
    this.i18n = {
      uz: {
        safe_title: "YO'L OCHIQ • XAVFSIZ HUDUD",
        safe_desc: "Yo'l ochiq. Belgilangan tezlikda xavfsiz harakatlanishingiz mumkin.",
        yellow_title: "DIQQAT: XAVFLI YAQINLASHUV",
        yellow_desc: "Tezlikni kamaytiring. Boshqa transport vositasiga yaqinlashmoqda.",
        red_title: "XAVF! ZUDLIK BILAN TO'XTANG!",
        red_desc: "To'qnashuv xavfi mavjud! Favqulodda tormoz berish tavsiya etiladi!",
        speed_unit: "km/soat",
        safe_limit: "Xavfsiz chegara:",
        location_label: "Shahar:",
        threat_title: "Xavf manbai:",
        threat_none: "Mavjud emas",
        threat_dist: "Yaqinlashish masofasi:",
        threat_ttc: "Zarbaga qadar vaqt (TTC):",
        ping_label: "Kechikish (Ping)",
        vehicles_label: "Atrofdagi avto",
        gateway_label: "V2X Aloqa",
        btn_gps_off: "📡 GPS: O'CHIQ",
        btn_gps_on: "📍 GPS: YOQILGAN (Jonli)",
        btn_restart: "⟲ Qayta boshlash",
        btn_brake: "🛑 TO'XTASH",
        btn_stealth_off: "👁 Yashirin: O'CHIQ",
        btn_stealth_on: "🕶 Yashirin: YOQILGAN",
        btn_sound_on: "🔊 Ovoz: YOQILGAN",
        btn_sound_off: "🔇 Ovoz: O'CHIQ",
        btn_voice_on: "🗣 AI Nutq: YOQILGAN",
        btn_voice_off: "🤐 AI Nutq: O'CHIQ",
        btn_hud: "🪞 HUD Proyeksiya",
        keyboard_tips: "⌨ Avto boshqaruvi: [↑/W] Gaz | [↓/S] Tormoz | [←/→/A/D] Rul | [Bo'shliq] To'xtash"
      },
      ru: {
        safe_title: "ПУТЬ СВОБОДЕН • БЕЗОПАСНАЯ ЗОНА",
        safe_desc: "Дорога свободна. Движение на крейсерской скорости разрешено.",
        yellow_title: "ВНИМАНИЕ: ОПАСНОЕ СБЛИЖЕНИЕ",
        yellow_desc: "Сбавьте скорость. Приближение к перекрестку или другому ТС.",
        red_title: "КРИТИЧЕСКАЯ ОПАСНОСТЬ СТОЛКНОВЕНИЯ!",
        red_desc: "Угроза удара на перекрестке! Экстренное торможение!",
        speed_unit: "км/ч",
        safe_limit: "Безопасный лимит:",
        location_label: "Локация:",
        threat_title: "Угроза столкновения:",
        threat_none: "Нет",
        threat_dist: "Дистанция сближения:",
        threat_ttc: "Время до удара (TTC):",
        ping_label: "Задержка (Пинг)",
        vehicles_label: "ТС в радиусе",
        gateway_label: "Шлюз V2X",
        btn_gps_off: "📡 GPS: ВЫКЛ",
        btn_gps_on: "📍 GPS: ВКЛ (Живой)",
        btn_restart: "⟲ Рестарт",
        btn_brake: "🛑 СТОП",
        btn_stealth_off: "👁 Невидимка: ВЫКЛ",
        btn_stealth_on: "🕶 Невидимка: ВКЛ",
        btn_sound_on: "🔊 Звук: ВКЛ",
        btn_sound_off: "🔇 Звук: ВЫКЛ",
        btn_voice_on: "🗣 Голос ИИ: ВКЛ",
        btn_voice_off: "🤐 Голос ИИ: ВЫКЛ",
        btn_hud: "🪞 Проекция HUD",
        keyboard_tips: "⌨ Управление авто: [↑/W] Газ | [↓/S] Тормоз | [←/→/A/D] Руль | [Пробел] Экстренный стоп"
      }
    };
  }

  init() {
    window.v2xMap.init();
    window.v2xAudio.setLanguage(this.lang);
    this._setupUIListeners();
    this._setupKeyboardControls();
    this.updateLanguageUI();
    this.connectWebSocket();
    this._startTelemetryLoop();

    // Запрос реального GPS устройства
    this._tryInitialGeolocation();
  }

  setLanguage(lang) {
    if (lang === "uz" || lang === "ru") {
      this.lang = lang;
      window.v2xAudio.setLanguage(lang);
      this.updateLanguageUI();
      // Озвучиваем переключение приятным голосом
      if (lang === "uz") {
        window.v2xAudio.speakText("O'zbek tili tanlandi. Xavfsiz safar tilaymiz.");
      } else {
        window.v2xAudio.speakText("Выбран русский язык. Безопасной дороги.");
      }
    }
  }

  updateLanguageUI() {
    const t = this.i18n[this.lang];
    document.getElementById("speed-unit-label").textContent = t.speed_unit;
    document.getElementById("safe-limit-label").textContent = t.safe_limit;
    document.getElementById("label-location").textContent = t.location_label;
    document.getElementById("label-threat-title").textContent = t.threat_title;
    document.getElementById("label-threat-dist").textContent = t.threat_dist;
    document.getElementById("label-threat-ttc").textContent = t.threat_ttc;
    document.getElementById("label-metric-ping").textContent = t.ping_label;
    document.getElementById("label-metric-vehicles").textContent = t.vehicles_label;
    document.getElementById("label-metric-gateway").textContent = t.gateway_label;
    document.getElementById("keyboard-tips").textContent = t.keyboard_tips;

    document.getElementById("btn-reset").textContent = t.btn_restart;
    document.getElementById("btn-emergency-brake").textContent = t.btn_brake;
    document.getElementById("btn-hud-mirror").textContent = t.btn_hud;

    const btnStealth = document.getElementById("btn-stealth");
    btnStealth.textContent = this.ego.stealth ? t.btn_stealth_on : t.btn_stealth_off;

    const btnSound = document.getElementById("btn-sound");
    btnSound.textContent = window.v2xAudio.soundEnabled ? t.btn_sound_on : t.btn_sound_off;

    const btnVoice = document.getElementById("btn-voice");
    btnVoice.textContent = window.v2xAudio.voiceEnabled ? t.btn_voice_on : t.btn_voice_off;

    const btnGps = document.getElementById("btn-real-gps");
    btnGps.textContent = this.gpsMode ? t.btn_gps_on : t.btn_gps_off;
  }

  _tryInitialGeolocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log("[V2X] Real GPS position detected:", pos.coords.latitude, pos.coords.longitude);
        this.ego.lat = pos.coords.latitude;
        this.ego.lon = pos.coords.longitude;
        if (pos.coords.heading && !isNaN(pos.coords.heading)) {
          this.ego.heading = pos.coords.heading;
        }
        this._syncAnchorWithServer(this.ego.lat, this.ego.lon);
        window.v2xMap.panTo(this.ego.lat, this.ego.lon, 17);
      },
      (err) => {
        console.log("[V2X] Using default Tashkent coordinates.");
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  async _syncAnchorWithServer(lat, lon) {
    try {
      await fetch("/api/simulator/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: lat, lon: lon })
      });
    } catch (e) {
      console.warn("Failed to sync anchor:", e);
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry/${this.vehicleId}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      document.getElementById("connection-status").textContent = "ONLINE (10 Hz)";
      document.getElementById("connection-status").style.color = "var(--color-green)";
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "safety_update") {
          this.handleSafetyUpdate(data);
        }
      } catch (e) {
        console.error("[V2X] Parse error:", e);
      }
    };

    this.ws.onerror = () => {
      document.getElementById("connection-status").textContent = "ERROR";
      document.getElementById("connection-status").style.color = "var(--color-red)";
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connectWebSocket(), 1000);
    };
  }

  _startTelemetryLoop() {
    const intervalMs = 1000 / this.telemetryHz;
    const dt = 1.0 / this.telemetryHz;

    this.sendInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.isPaused) return;

      if (!this.gpsMode && this.ego.isMoving) {
        const speedMs = this.ego.speed / 3.6;
        const dist = speedMs * dt;
        const rad = (this.ego.heading * Math.PI) / 180.0;
        const dEast = dist * Math.sin(rad);
        const dNorth = dist * Math.cos(rad);

        const METERS_PER_DEG_LAT = 111139.0;
        const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((this.ego.lat * Math.PI) / 180.0);

        this.ego.lat += dNorth / METERS_PER_DEG_LAT;
        this.ego.lon += dEast / metersPerDegLon;
      }

      const payload = {
        vehicle_id: this.vehicleId,
        vehicle_type: "car",
        lat: Number(this.ego.lat.toFixed(7)),
        lon: Number(this.ego.lon.toFixed(7)),
        speed: Number(this.ego.speed.toFixed(1)),
        heading: Number(this.ego.heading.toFixed(1)),
        elevation: 450.0,
        stealth: this.ego.stealth,
        client_time: Date.now()
      };

      this.ws.send(JSON.stringify(payload));
    }, intervalMs);
  }

  handleSafetyUpdate(data) {
    const safety = data.safety;
    const t = this.i18n[this.lang];
    const now = Date.now();
    if (data.client_time > 0) {
      this.rtt = Math.max(0, now - data.client_time);
    }

    const statusBar = document.getElementById("safety-status-bar");
    const statusTitle = document.getElementById("status-title");
    const statusDesc = document.getElementById("status-desc");
    const statusIcon = document.getElementById("status-icon");

    statusBar.className = `status-${safety.level.toLowerCase()}`;
    
    if (safety.level === "RED") {
      statusIcon.textContent = "⚠";
      statusTitle.textContent = t.red_title;
      statusTitle.style.color = "var(--color-red)";
      statusDesc.textContent = t.red_desc;
    } else if (safety.level === "YELLOW") {
      statusIcon.textContent = "!";
      statusTitle.textContent = t.yellow_title;
      statusTitle.style.color = "var(--color-yellow)";
      statusDesc.textContent = t.yellow_desc;
    } else {
      statusIcon.textContent = "✓";
      statusTitle.textContent = t.safe_title;
      statusTitle.style.color = "var(--color-green)";
      statusDesc.textContent = t.safe_desc;
    }

    document.getElementById("speed-display").textContent = Math.round(this.ego.speed);
    document.getElementById("rec-speed-badge").textContent = `${Math.round(safety.recommended_speed)} ${t.speed_unit}`;

    document.getElementById("metric-ping").textContent = `${this.rtt} ms`;
    document.getElementById("metric-vehicles").textContent = data.neighbors.length;

    const threatCard = document.getElementById("threat-card");
    threatCard.className = `hud-panel threat-card hazard-${safety.level.toLowerCase()}`;
    document.getElementById("threat-vid").textContent = safety.threat_vehicle_id || t.threat_none;
    document.getElementById("threat-dist").textContent = safety.closest_distance !== null ? `${safety.closest_distance} m` : "--";
    document.getElementById("threat-ttc").textContent = safety.min_ttc !== null ? `${safety.min_ttc} s` : "--";

    // Голосовой движок с человеческой речью
    window.v2xAudio.updateSafetyLevel(safety.level, safety.alert_message, {
      is_intersection_risk: safety.is_intersection_risk,
      is_blind_spot: safety.is_blind_spot
    });

    // Отрисовка на карте
    window.v2xMap.updateEgo(this.ego.lat, this.ego.lon, this.ego.heading, this.ego.speed, safety.level);
    window.v2xMap.updateNeighbors(data.neighbors, this.ego.lat, this.ego.lon, safety.threat_vehicle_id);
  }

  _setupKeyboardControls() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }

      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          this.ego.speed = Math.min(160, this.ego.speed + 5);
          this.ego.isMoving = true;
          break;
        case "ArrowDown":
        case "KeyS":
          this.ego.speed = Math.max(0, this.ego.speed - 5);
          if (this.ego.speed === 0) this.ego.isMoving = false;
          break;
        case "ArrowLeft":
        case "KeyA":
          this.ego.heading = (this.ego.heading - 10 + 360) % 360;
          break;
        case "ArrowRight":
        case "KeyD":
          this.ego.heading = (this.ego.heading + 10) % 360;
          break;
        case "Space":
          this.ego.speed = 0;
          this.ego.isMoving = false;
          break;
      }
    });
  }

  _setupUIListeners() {
    // Переключатель языка (Русский / Узбекский)
    const langSelect = document.getElementById("lang-select");
    if (langSelect) {
      langSelect.addEventListener("change", (e) => {
        this.setLanguage(e.target.value);
      });
    }

    // Выбор модели автомобиля (Cobalt / Tracker / Tesla)
    const carModelSelect = document.getElementById("car-model-select");
    if (carModelSelect) {
      carModelSelect.addEventListener("change", (e) => {
        window.v2xMap.setCarModel(e.target.value);
      });
    }

    // Выбор города в Узбекистане
    const citySelect = document.getElementById("city-select");
    if (citySelect) {
      citySelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val === "tashkent") {
          this.ego.lat = 41.311081;
          this.ego.lon = 69.279737;
        } else if (val === "samarkand") {
          this.ego.lat = 39.654766;
          this.ego.lon = 66.975765;
        } else if (val === "bukhara") {
          this.ego.lat = 39.774722;
          this.ego.lon = 64.428611;
        }
        this._syncAnchorWithServer(this.ego.lat, this.ego.lon);
        window.v2xMap.panTo(this.ego.lat, this.ego.lon, 17);
      });
    }

    // HUD Mirror
    const btnMirror = document.getElementById("btn-hud-mirror");
    btnMirror.addEventListener("click", () => {
      this.hudMirror = !this.hudMirror;
      document.body.classList.toggle("hud-mirror", this.hudMirror);
      btnMirror.classList.toggle("active", this.hudMirror);
    });

    // Режим Невидимка
    const btnStealth = document.getElementById("btn-stealth");
    btnStealth.addEventListener("click", () => {
      this.ego.stealth = !this.ego.stealth;
      btnStealth.classList.toggle("stealth-active", this.ego.stealth);
      this.updateLanguageUI();
    });

    // Звук
    const btnSound = document.getElementById("btn-sound");
    btnSound.addEventListener("click", () => {
      window.v2xAudio.soundEnabled = !window.v2xAudio.soundEnabled;
      btnSound.classList.toggle("active", window.v2xAudio.soundEnabled);
      this.updateLanguageUI();
    });

    // Голос ИИ
    const btnVoice = document.getElementById("btn-voice");
    btnVoice.addEventListener("click", () => {
      window.v2xAudio.voiceEnabled = !window.v2xAudio.voiceEnabled;
      btnVoice.classList.toggle("active", window.v2xAudio.voiceEnabled);
      this.updateLanguageUI();
    });

    // Экстренный тормоз
    const btnBrake = document.getElementById("btn-emergency-brake");
    btnBrake.addEventListener("click", () => {
      this.ego.speed = 0;
      this.ego.isMoving = false;
    });

    // Рестарт симулятора
    const btnReset = document.getElementById("btn-reset");
    btnReset.addEventListener("click", async () => {
      await fetch("/api/simulator/reset", { method: "POST" });
    });

    // Сценарий
    const scenarioSelect = document.getElementById("scenario-select");
    scenarioSelect.addEventListener("change", async (e) => {
      try {
        await fetch("/api/simulator/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: e.target.value })
        });
      } catch (err) {
        console.error("Failed to set scenario:", err);
      }
    });

    // Кнопка включения/выключения реального GPS
    const btnGps = document.getElementById("btn-real-gps");
    btnGps.addEventListener("click", () => {
      const t = this.i18n[this.lang];
      if (!this.gpsMode) {
        if (!navigator.geolocation) {
          alert("GPS qurilmangizda qo'llab-quvvatlanmaydi / Геолокация не поддерживается");
          return;
        }

        btnGps.textContent = "📡 GPS qidirilmoqda...";

        this.gpsWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            const now = Date.now();
            const newLat = pos.coords.latitude;
            const newLon = pos.coords.longitude;

            if (this.lastGpsCoords && this.lastGpsTimestamp) {
              const dtSec = (now - this.lastGpsTimestamp) / 1000.0;
              if (dtSec > 0.5) {
                const dLat = (newLat - this.lastGpsCoords.lat) * 111139.0;
                const dLon = (newLon - this.lastGpsCoords.lon) * 111139.0 * Math.cos(newLat * Math.PI / 180);
                const distM = Math.hypot(dLat, dLon);
                if (distM > 1.0) {
                  this.ego.speed = Math.round((distM / dtSec) * 3.6);
                  this.ego.heading = Math.round((Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360);
                }
              }
            }

            if (pos.coords.speed !== null && !isNaN(pos.coords.speed)) {
              this.ego.speed = Math.round(pos.coords.speed * 3.6);
            }
            if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
              this.ego.heading = Math.round(pos.coords.heading);
            }

            this.ego.lat = newLat;
            this.ego.lon = newLon;
            this.lastGpsCoords = { lat: newLat, lon: newLon };
            this.lastGpsTimestamp = now;

            this._syncAnchorWithServer(newLat, newLon);

            btnGps.classList.add("gps-live-active");
            btnGps.textContent = t.btn_gps_on;
          },
          (err) => {
            alert("GPS xatosi: " + err.message);
            this.gpsMode = false;
            btnGps.classList.remove("gps-live-active");
            btnGps.textContent = t.btn_gps_off;
          },
          { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 }
        );

        this.gpsMode = true;
      } else {
        if (this.gpsWatchId !== null) {
          navigator.geolocation.clearWatch(this.gpsWatchId);
          this.gpsWatchId = null;
        }
        this.gpsMode = false;
        btnGps.classList.remove("gps-live-active");
        btnGps.textContent = t.btn_gps_off;
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.v2xApp = new V2XApp();
  window.v2xApp.init();
});
