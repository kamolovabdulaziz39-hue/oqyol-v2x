/**
 * Main V2X Application Controller.
 * Handles WebSocket telemetry pipeline, keyboard drive controls, HUD projection and scenario management.
 */

class V2XApp {
  constructor() {
    this.vehicleId = "CAR-EGO-" + Math.floor(100 + Math.random() * 900);
    this.ws = null;
    this.sendInterval = null;
    this.telemetryHz = 10;
    
    // Начальное положение собственного ТС (Южнее перекрестка, курс на Север)
    this.ego = {
      lat: 55.749444,
      lon: 37.618423,
      speed: 55.0,     // км/ч
      heading: 0.0,    // 0 = Север
      stealth: false,
      isMoving: true
    };

    this.gpsMode = false;
    this.gpsWatchId = null;
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

      // Если не включен реальный GPS, симулируем движение эго-ТС
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

        // Зацикливание по границам района для непрерывной симуляции
        if (this.ego.lat > 55.7535) this.ego.lat = 55.7485;
        if (this.ego.lon > 37.6230) this.ego.lon = 37.6140;
      }

      // Отправка пакета телеметрии
      const payload = {
        vehicle_id: this.vehicleId,
        vehicle_type: "car",
        lat: Number(this.ego.lat.toFixed(7)),
        lon: Number(this.ego.lon.toFixed(7)),
        speed: Number(this.ego.speed.toFixed(1)),
        heading: Number(this.ego.heading.toFixed(1)),
        elevation: 150.0,
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

    // 1. Обновление строки безопасности
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
    // HUD Mirror Mode
    const btnMirror = document.getElementById("btn-hud-mirror");
    btnMirror.addEventListener("click", () => {
      this.hudMirror = !this.hudMirror;
      document.body.classList.toggle("hud-mirror", this.hudMirror);
      btnMirror.classList.toggle("active", this.hudMirror);
    });

    // Stealth Mode Toggle
    const btnStealth = document.getElementById("btn-stealth");
    btnStealth.addEventListener("click", () => {
      this.ego.stealth = !this.ego.stealth;
      btnStealth.classList.toggle("stealth-active", this.ego.stealth);
      btnStealth.textContent = this.ego.stealth ? "🕶 Невидимка: ВКЛ" : "👁 Невидимка: ВЫКЛ";
    });

    // Sound Toggle
    const btnSound = document.getElementById("btn-sound");
    btnSound.addEventListener("click", () => {
      window.v2xAudio.soundEnabled = !window.v2xAudio.soundEnabled;
      btnSound.classList.toggle("active", window.v2xAudio.soundEnabled);
      btnSound.textContent = window.v2xAudio.soundEnabled ? "🔊 Звук: ВКЛ" : "🔇 Звук: ВЫКЛ";
    });

    // Voice Alert Toggle
    const btnVoice = document.getElementById("btn-voice");
    btnVoice.addEventListener("click", () => {
      window.v2xAudio.voiceEnabled = !window.v2xAudio.voiceEnabled;
      btnVoice.classList.toggle("active", window.v2xAudio.voiceEnabled);
      btnVoice.textContent = window.v2xAudio.voiceEnabled ? "🗣 Голос: ВКЛ" : "🤐 Голос: ВЫКЛ";
    });

    // Emergency Brake Button
    const btnBrake = document.getElementById("btn-emergency-brake");
    btnBrake.addEventListener("click", () => {
      this.ego.speed = 0;
      this.ego.isMoving = false;
    });

    // Scenario Selection
    const scenarioSelect = document.getElementById("scenario-select");
    scenarioSelect.addEventListener("change", async (e) => {
      const scenario = e.target.value;
      try {
        await fetch("/api/simulator/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: scenario })
        });
        // Сбросим эго-ТС в исходное положение для сценария
        this.resetEgoPositionForScenario(scenario);
      } catch (err) {
        console.error("Failed to set scenario:", err);
      }
    });

    // Reset Button
    const btnReset = document.getElementById("btn-reset");
    btnReset.addEventListener("click", async () => {
      await fetch("/api/simulator/reset", { method: "POST" });
      this.resetEgoPositionForScenario(scenarioSelect.value);
    });

    // GPS Mode Toggle
    const btnGps = document.getElementById("btn-real-gps");
    btnGps.addEventListener("click", () => {
      if (!this.gpsMode) {
        if (!navigator.geolocation) {
          alert("Геолокация не поддерживается вашим браузером");
          return;
        }
        this.gpsWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            this.ego.lat = pos.coords.latitude;
            this.ego.lon = pos.coords.longitude;
            if (pos.coords.speed !== null && !isNaN(pos.coords.speed)) {
              this.ego.speed = pos.coords.speed * 3.6;
            }
            if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
              this.ego.heading = pos.coords.heading;
            }
          },
          (err) => console.warn("GPS error:", err),
          { enableHighAccuracy: true, maximumAge: 100 }
        );
        this.gpsMode = true;
        btnGps.classList.add("active");
        btnGps.textContent = "📡 GPS Активен";
      } else {
        if (this.gpsWatchId) navigator.geolocation.clearWatch(this.gpsWatchId);
        this.gpsMode = false;
        btnGps.classList.remove("active");
        btnGps.textContent = "📡 Реальный GPS";
      }
    });
  }

  resetEgoPositionForScenario(scenario) {
    if (scenario === "intersection_blind") {
      this.ego.lat = 55.749444;
      this.ego.lon = 37.618423;
      this.ego.heading = 0.0;
      this.ego.speed = 54.0;
    } else if (scenario === "blind_spot_overtake") {
      this.ego.lat = 55.751244;
      this.ego.lon = 37.618423;
      this.ego.heading = 90.0;
      this.ego.speed = 75.0;
    } else if (scenario === "head_on_curve") {
      this.ego.lat = 55.749244;
      this.ego.lon = 37.618423;
      this.ego.heading = 0.0;
      this.ego.speed = 50.0;
    }
    this.ego.isMoving = true;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.v2xApp = new V2XApp();
  window.v2xApp.init();
});
