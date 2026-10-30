/**
 * Main V2X Application Controller (Uzbekistan / Tashkent & Real GPS Integration).
 * Handles WebSocket telemetry pipeline, live geolocation, keyboard drive controls,
 * HUD projection and scenario management.
 */

class V2XApp {
  constructor() {
    this.vehicleId = "UZB-" + Math.floor(100 + Math.random() * 900);
    this.ws = null;
    this.sendInterval = null;
    this.telemetryHz = 10;

    // Начальные координаты: Ташкент, Узбекистан (Сквер Амира Темура)
    this.tashkentCoords = { lat: 41.311081, lon: 69.279737 };
    
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
  }

  init() {
    window.v2xMap.init();
    this._setupUIListeners();
    this._setupKeyboardControls();
    this.connectWebSocket();
    this._startTelemetryLoop();

    // Запрос реальной геолокации при открытии страницы
    this._tryInitialGeolocation();
  }

  _tryInitialGeolocation() {
    if (!navigator.geolocation) {
      console.log("[V2X] Geolocation API not supported. Using Tashkent base.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log("[V2X] Real GPS position detected:", pos.coords.latitude, pos.coords.longitude);
        this.ego.lat = pos.coords.latitude;
        this.ego.lon = pos.coords.longitude;
        if (pos.coords.heading && !isNaN(pos.coords.heading)) {
          this.ego.heading = pos.coords.heading;
        }
        // Синхронизируем симулятор окружения вокруг реальных координат
        this._syncAnchorWithServer(this.ego.lat, this.ego.lon);
        window.v2xMap.panTo(this.ego.lat, this.ego.lon, 17);
      },
      (err) => {
        console.log("[V2X] Geolocation permission not granted or timeout. Defaulting to Tashkent, Uzbekistan.", err.message);
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
      console.log("[V2X] WebSocket connected for", this.vehicleId);
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
        console.error("[V2X] Error parsing message:", e);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[V2X] WebSocket error:", err);
      document.getElementById("connection-status").textContent = "ERROR";
      document.getElementById("connection-status").style.color = "var(--color-red)";
    };

    this.ws.onclose = () => {
      console.warn("[V2X] WebSocket disconnected. Reconnecting in 1s...");
      document.getElementById("connection-status").textContent = "RECONNECTING";
      document.getElementById("connection-status").style.color = "var(--color-yellow)";
      setTimeout(() => this.connectWebSocket(), 1000);
    };
  }

  _startTelemetryLoop() {
    const intervalMs = 1000 / this.telemetryHz;
    const dt = 1.0 / this.telemetryHz;

    this.sendInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.isPaused) return;

      // Если выключен реальный GPS, перемещаем машину по курсу со скоростью speed
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

      // Формирование пакета телеметрии
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
    const now = Date.now();
    if (data.client_time > 0) {
      this.rtt = Math.max(0, now - data.client_time);
    }

    // 1. Обновление статусной строки безопасности
    const statusBar = document.getElementById("safety-status-bar");
    const statusTitle = document.getElementById("status-title");
    const statusDesc = document.getElementById("status-desc");
    const statusIcon = document.getElementById("status-icon");

    statusBar.className = `status-${safety.level.toLowerCase()}`;
    
    if (safety.level === "RED") {
      statusIcon.textContent = "⚠";
      statusTitle.textContent = "КРИТИЧЕСКАЯ ОПАСНОСТЬ СТОЛКНОВЕНИЯ!";
      statusTitle.style.color = "var(--color-red)";
    } else if (safety.level === "YELLOW") {
      statusIcon.textContent = "!";
      statusTitle.textContent = "ВНИМАНИЕ: ОПАСНОЕ СБЛИЖЕНИЕ";
      statusTitle.style.color = "var(--color-yellow)";
    } else {
      statusIcon.textContent = "✓";
      statusTitle.textContent = "ПУТЬ СВОБОДЕН • БЕЗОПАСНАЯ ЗОНА";
      statusTitle.style.color = "var(--color-green)";
    }
    statusDesc.textContent = safety.alert_message;

    // 2. Спидометр и рекомендации
    document.getElementById("speed-display").textContent = Math.round(this.ego.speed);
    document.getElementById("rec-speed-badge").textContent = `${Math.round(safety.recommended_speed)} км/ч`;

    // 3. Метрики производительности
    document.getElementById("metric-ping").textContent = `${this.rtt} мс`;
    document.getElementById("metric-vehicles").textContent = data.neighbors.length;

    // 4. Карточка угрозы
    const threatCard = document.getElementById("threat-card");
    threatCard.className = `hud-panel threat-card hazard-${safety.level.toLowerCase()}`;
    document.getElementById("threat-vid").textContent = safety.threat_vehicle_id || "Нет";
    document.getElementById("threat-dist").textContent = safety.closest_distance !== null ? `${safety.closest_distance} м` : "--";
    document.getElementById("threat-ttc").textContent = safety.min_ttc !== null ? `${safety.min_ttc} с` : "--";

    // 5. Звук и речь
    window.v2xAudio.updateSafetyLevel(safety.level, safety.alert_message);

    // 6. Отрисовка на карте
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

    // Кнопка HUD Mirror
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
      btnStealth.textContent = this.ego.stealth ? "🕶 Невидимка: ВКЛ" : "👁 Невидимка: ВЫКЛ";
    });

    // Звук
    const btnSound = document.getElementById("btn-sound");
    btnSound.addEventListener("click", () => {
      window.v2xAudio.soundEnabled = !window.v2xAudio.soundEnabled;
      btnSound.classList.toggle("active", window.v2xAudio.soundEnabled);
      btnSound.textContent = window.v2xAudio.soundEnabled ? "🔊 Звук: ВКЛ" : "🔇 Звук: ВЫКЛ";
    });

    // Голос
    const btnVoice = document.getElementById("btn-voice");
    btnVoice.addEventListener("click", () => {
      window.v2xAudio.voiceEnabled = !window.v2xAudio.voiceEnabled;
      btnVoice.classList.toggle("active", window.v2xAudio.voiceEnabled);
      btnVoice.textContent = window.v2xAudio.voiceEnabled ? "🗣 Голос: ВКЛ" : "🤐 Голос: ВЫКЛ";
    });

    // Экстренный тормоз
    const btnBrake = document.getElementById("btn-emergency-brake");
    btnBrake.addEventListener("click", () => {
      this.ego.speed = 0;
      this.ego.isMoving = false;
    });

    // Выбор сценария симуляции
    const scenarioSelect = document.getElementById("scenario-select");
    scenarioSelect.addEventListener("change", async (e) => {
      const scenario = e.target.value;
      try {
        await fetch("/api/simulator/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: scenario })
        });
      } catch (err) {
        console.error("Failed to set scenario:", err);
      }
    });

    // Рестарт сценария
    const btnReset = document.getElementById("btn-reset");
    btnReset.addEventListener("click", async () => {
      await fetch("/api/simulator/reset", { method: "POST" });
    });

    // Кнопка включения/выключения реального GPS
    const btnGps = document.getElementById("btn-real-gps");
    btnGps.addEventListener("click", () => {
      if (!this.gpsMode) {
        // Включение реального GPS
        if (!navigator.geolocation) {
          alert("Геолокация не поддерживается вашим браузером");
          return;
        }

        btnGps.textContent = "📡 Поиск спутников GPS...";

        this.gpsWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            const now = Date.now();
            const newLat = pos.coords.latitude;
            const newLon = pos.coords.longitude;

            // Вычисление курса и скорости, если устройство не возвращает их напрямую
            if (this.lastGpsCoords && this.lastGpsTimestamp) {
              const dtSec = (now - this.lastGpsTimestamp) / 1000.0;
              if (dtSec > 0.5) {
                const dLat = (newLat - this.lastGpsCoords.lat) * 111139.0;
                const dLon = (newLon - this.lastGpsCoords.lon) * 111139.0 * Math.cos(newLat * Math.PI / 180);
                const distM = Math.hypot(dLat, dLon);
                if (distM > 1.0) {
                  const computedSpeedKmh = (distM / dtSec) * 3.6;
                  this.ego.speed = Math.round(computedSpeedKmh);
                  const computedHeading = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
                  this.ego.heading = Math.round(computedHeading);
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

            // Синхронизация других ТС вокруг текущих координат пользователя
            this._syncAnchorWithServer(newLat, newLon);

            btnGps.classList.add("gps-live-active");
            btnGps.textContent = "📍 GPS: ВКЛ (Живой)";
            document.getElementById("status-desc").textContent = `GPS активен. Координаты: ${newLat.toFixed(5)}, ${newLon.toFixed(5)}`;
          },
          (err) => {
            console.warn("GPS watch error:", err);
            alert("Не удалось получить сигнал GPS: " + err.message);
            this.gpsMode = false;
            btnGps.classList.remove("gps-live-active");
            btnGps.textContent = "📡 GPS: ВЫКЛ";
          },
          { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 }
        );

        this.gpsMode = true;
      } else {
        // Отключение реального GPS: возврат в режим виртуального вождения
        if (this.gpsWatchId !== null) {
          navigator.geolocation.clearWatch(this.gpsWatchId);
          this.gpsWatchId = null;
        }
        this.gpsMode = false;
        btnGps.classList.remove("gps-live-active");
        btnGps.textContent = "📡 GPS: ВЫКЛ";
        document.getElementById("status-desc").textContent = "GPS выключен. Ручной режим управления (WASD / Стрелки).";
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.v2xApp = new V2XApp();
  window.v2xApp.init();
});
