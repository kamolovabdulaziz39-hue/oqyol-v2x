/**
 * Interactive V2X Map Controller (Uzbekistan / Tashkent & Real GPS).
 * Features Photorealistic Automotive 3D top-down models (Chevrolet Cobalt/Malibu/Tracker/Tesla),
 * OpenStreetMap & ESRI Satellite layers, dynamic brake lights, xenon headlight beams, and V2X radar.
 */

class V2XMapController {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.egoMarker = null;
    this.radarCircle = null;
    this.neighborMarkers = new Map();
    this.trajectoryLines = new Map();
    this.collisionRay = null;
    this.followEgo = true;
    this.isInitialized = false;

    // Выбранный стиль автомобиля пользователя
    this.carModel = "cobalt"; // "cobalt" (Sedan), "tracker" (SUV), "chevron" (Tesla 3D)

    // Центр по умолчанию: Ташкент, Узбекистан (Сквер Амира Темура)
    this.defaultCenter = [41.311081, 69.279737];
    this.defaultZoom = 17;
  }

  setCarModel(model) {
    this.carModel = model;
    console.log("[V2X Map] Vehicle model set to:", model);
  }

  init() {
    if (this.isInitialized || !window.L) return;

    // Инициализация карты Leaflet
    this.map = L.map(this.containerId, {
      center: this.defaultCenter,
      zoom: this.defaultZoom,
      zoomControl: false,
      attributionControl: true
    });

    // 1. Стандартная подробная карта дорог OpenStreetMap (Узбекистан)
    const osmRoads = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });

    // 2. Спутниковые снимки высокого разрешения ESRI World Imagery
    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '© ESRI World Imagery'
    });

    // 3. Автомобильный темный навигатор (OSM с контрастным ночным фильтром)
    const darkNavigator = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-nav-tiles',
      attribution: '© OpenStreetMap | V2X Navigation'
    });

    // По умолчанию включаем ночной темный навигатор
    darkNavigator.addTo(this.map);

    // Добавляем переключатель слоев
    const baseMaps = {
      "🌙 Ночной навигатор": darkNavigator,
      "🗺️ Дороги (OpenStreetMap)": osmRoads,
      "🛰️ Спутник (ESRI)": esriSatellite
    };
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(this.map);

    // Зум-контрол в правом нижнем углу
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Радарная зона безопасности вокруг собственного ТС (радиус 120 м)
    this.radarCircle = L.circle(this.defaultCenter, {
      radius: 120,
      color: '#00e676',
      weight: 1.5,
      dashArray: '5, 8',
      fillColor: '#00e676',
      fillOpacity: 0.04
    }).addTo(this.map);

    this.isInitialized = true;
  }

  /**
   * Генерация фотореалистичного 3D-кузова автомобиля (вид сверху)
   */
  _getPhotorealisticVehicleSVG(isEgo, threatLevel, speed, modelOverride = null) {
    const model = isEgo ? (modelOverride || this.carModel) : "sedan";
    const isBraking = (speed <= 5.0);

    // Цветовая гамма кузова
    let bodyGradStart = "#f0f4f8";
    let bodyGradEnd = "#cbd5e1";
    let roofGrad = "#1e293b";
    let outlineStroke = "#ffffff";
    let glowFilter = "drop-shadow(0 6px 14px rgba(0, 0, 0, 0.75))";
    let headlightBeamColor = "rgba(255, 255, 240, 0.75)";

    if (isEgo) {
      if (model === "tracker") {
        bodyGradStart = "#334155";
        bodyGradEnd = "#1e293b";
        outlineStroke = "#94a3b8";
      } else if (model === "chevron") {
        bodyGradStart = "#00e676";
        bodyGradEnd = "#00b0ff";
        outlineStroke = "#ffffff";
      } else {
        // Chevrolet Cobalt / Malibu (Белый жемчуг)
        bodyGradStart = "#ffffff";
        bodyGradEnd = "#e2e8f0";
        outlineStroke = "#94a3b8";
      }
    } else {
      // Соседние автомобили
      if (threatLevel === "RED") {
        bodyGradStart = "#ff1744";
        bodyGradEnd = "#b71c1c";
        outlineStroke = "#ffffff";
        glowFilter = "drop-shadow(0 0 16px rgba(255, 23, 68, 0.9))";
        headlightBeamColor = "rgba(255, 82, 82, 0.85)";
      } else if (threatLevel === "YELLOW") {
        bodyGradStart = "#ffb300";
        bodyGradEnd = "#f57c00";
        outlineStroke = "#ffffff";
        glowFilter = "drop-shadow(0 0 14px rgba(255, 179, 0, 0.8))";
      } else {
        bodyGradStart = "#2563eb";
        bodyGradEnd = "#1d4ed8";
        outlineStroke = "#93c5fd";
      }
    }

    const brakeLightIntensity = isBraking ? "#ff0000" : "#991b1b";
    const brakeGlow = isBraking ? "filter: drop-shadow(0 4px 10px #ff0000);" : "";

    if (model === "chevron" && isEgo) {
      // Высокотехнологичная 3D-стрелка навигатора (Tesla FSD / Yandex Pro)
      return `
        <div class="photoreal-car-wrap" style="${glowFilter}">
          <div class="headlight-beam" style="
            position: absolute; top: -42px; left: 50%; transform: translateX(-50%);
            width: 44px; height: 50px;
            background: radial-gradient(ellipse at 50% 100%, ${headlightBeamColor} 0%, rgba(255,255,255,0.15) 50%, transparent 80%);
            clip-path: polygon(20% 100%, 80% 100%, 100% 0%, 0% 0%);
            pointer-events: none;
          "></div>
          <svg width="40" height="64" viewBox="0 0 40 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="chevGrad" x1="20" y1="0" x2="20" y2="64" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#00e676" />
                <stop offset="100%" stop-color="#00b0ff" />
              </linearGradient>
            </defs>
            <path d="M20 2L38 52L20 42L2 52L20 2Z" fill="url(#chevGrad)" stroke="#ffffff" stroke-width="2" />
            <path d="M20 10L32 46L20 38L8 46L20 10Z" fill="rgba(0,0,0,0.3)" />
            <circle cx="20" cy="24" r="3.5" fill="#ffffff" />
          </svg>
        </div>
      `;
    }

    // Фотореалистичный седан / кроссовер
    return `
      <div class="photoreal-car-wrap" style="${glowFilter}">
        <!-- Реалистичный световой конус передних ксеноновых фар на асфальт -->
        <div class="headlight-beam" style="
          position: absolute;
          top: -46px;
          left: 50%;
          transform: translateX(-50%);
          width: 52px;
          height: 56px;
          background: radial-gradient(ellipse at 50% 100%, ${headlightBeamColor} 0%, rgba(255,255,255,0.2) 40%, transparent 75%);
          pointer-events: none;
          opacity: 0.9;
          clip-path: polygon(25% 100%, 75% 100%, 100% 0%, 0% 0%);
        "></div>

        <!-- 3D Автомобиль с высокой детализацией -->
        <svg width="42" height="76" viewBox="0 0 42 76" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <!-- Градиент кузова -->
            <linearGradient id="bodyGrad_${isEgo}" x1="0" y1="0" x2="42" y2="76" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="${bodyGradStart}" />
              <stop offset="50%" stop-color="${bodyGradEnd}" />
              <stop offset="100%" stop-color="${bodyGradStart}" />
            </linearGradient>
            <!-- Градиент лобового стекла -->
            <linearGradient id="windshieldGrad" x1="21" y1="18" x2="21" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#0f172a" />
              <stop offset="50%" stop-color="#1e293b" />
              <stop offset="100%" stop-color="#334155" />
            </linearGradient>
            <!-- Блик на стекле -->
            <linearGradient id="glareGrad" x1="10" y1="20" x2="32" y2="30" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="rgba(255,255,255,0.7)" />
              <stop offset="100%" stop-color="rgba(255,255,255,0.0)" />
            </linearGradient>
          </defs>

          <!-- Глубокая тень кузова на асфальт -->
          <ellipse cx="21" cy="40" rx="19" ry="34" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>

          <!-- 4 Широких резиновых колеса с литыми дисками -->
          <rect x="1" y="12" width="5" height="15" rx="2.5" fill="#0f172a" stroke="#475569" stroke-width="0.8"/>
          <rect x="36" y="12" width="5" height="15" rx="2.5" fill="#0f172a" stroke="#475569" stroke-width="0.8"/>
          <rect x="1" y="50" width="5" height="15" rx="2.5" fill="#0f172a" stroke="#475569" stroke-width="0.8"/>
          <rect x="36" y="50" width="5" height="15" rx="2.5" fill="#0f172a" stroke="#475569" stroke-width="0.8"/>

          <!-- Аэродинамический кузов автомобиля -->
          <path d="M7 16C7 8 13 3 21 3C29 3 35 8 35 16V60C35 68 30 73 21 73C12 73 7 68 7 60V16Z" 
                fill="url(#bodyGrad_${isEgo})" stroke="${outlineStroke}" stroke-width="1.6"/>

          <!-- Рельефные аэродинамические выштамповки капота -->
          <path d="M12 5L15 18M30 5L27 18" stroke="rgba(0,0,0,0.15)" stroke-width="1.2" stroke-linecap="round"/>

          <!-- Передняя решетка радиатора / воздухозаборник -->
          <path d="M14 4H28" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>

          <!-- Лобовое стекло изогнутое аэродинамическое -->
          <path d="M10 20C10 18 14 17 21 17C28 17 32 18 32 20V31C32 33 28 34 21 34C14 34 10 33 10 31V20Z" 
                fill="url(#windshieldGrad)" stroke="#475569" stroke-width="0.9"/>
          <!-- Диагональный блик света на лобовом стекле -->
          <path d="M12 21L28 29" stroke="url(#glareGrad)" stroke-width="1.8" stroke-linecap="round"/>

          <!-- Панорамная крыша / Люк -->
          <rect x="12" y="35" width="18" height="17" rx="3.5" fill="${roofGrad}" stroke="rgba(0,0,0,0.2)"/>

          <!-- Заднее стекло -->
          <path d="M11 54C11 53 15 52 21 52C27 52 31 53 31 54V59C31 60 27 61 21 61C15 61 11 60 11 59V54Z" 
                fill="url(#windshieldGrad)"/>

          <!-- Боковые зеркала с повторителями поворота -->
          <rect x="2" y="20" width="4" height="7" rx="2" fill="url(#bodyGrad_${isEgo})" stroke="${outlineStroke}" stroke-width="0.8"/>
          <rect x="36" y="20" width="4" height="7" rx="2" fill="url(#bodyGrad_${isEgo})" stroke="${outlineStroke}" stroke-width="0.8"/>

          <!-- Передние ксеноновые линзы фар -->
          <ellipse cx="11" cy="6" rx="2.8" ry="1.8" fill="#ffffff" filter="drop-shadow(0 0 3px #ffffff)"/>
          <ellipse cx="31" cy="6" rx="2.8" ry="1.8" fill="#ffffff" filter="drop-shadow(0 0 3px #ffffff)"/>

          <!-- Задние светодиодные стоп-сигналы (Светятся ярко при торможении!) -->
          <rect x="9" y="70" width="7" height="2.5" rx="1.2" fill="${brakeLightIntensity}" style="${brakeGlow}"/>
          <rect x="26" y="70" width="7" height="2.5" rx="1.2" fill="${brakeLightIntensity}" style="${brakeGlow}"/>
        </svg>
      </div>
    `;
  }

  _createVehicleIcon(label, heading, isEgo, threatLevel, speed) {
    const rot = Math.round(heading || 0);
    const carHtml = this._getPhotorealisticVehicleSVG(isEgo, threatLevel, speed);

    const badgeBorderColor = isEgo ? '#00e676' : (threatLevel === 'RED' ? '#ff1744' : (threatLevel === 'YELLOW' ? '#ffb300' : '#38bdf8'));

    const html = `
      <div class="vehicle-marker-wrapper" style="transform: rotate(${rot}deg);">
        ${carHtml}
        <!-- Информационная плашка над машиной (всегда горизонтальна) -->
        <div class="vehicle-plate" style="
          position: absolute;
          bottom: -24px;
          left: 50%;
          transform: translateX(-50%) rotate(-${rot}deg);
          white-space: nowrap;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace;
          font-size: 11px;
          font-weight: 700;
          color: #ffffff;
          background: rgba(15, 23, 42, 0.94);
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid ${badgeBorderColor};
          box-shadow: 0 4px 14px rgba(0,0,0,0.85);
          pointer-events: none;
        ">${label}</div>
      </div>
    `;

    return L.divIcon({
      html: html,
      className: 'custom-car-div-icon',
      iconSize: [46, 84],
      iconAnchor: [23, 42]
    });
  }

  updateEgo(lat, lon, heading, speed, safetyLevel) {
    if (!this.map) return;

    const latlng = [lat, lon];
    const speedUnit = (window.v2xAudio && window.v2xAudio.currentLanguage === "uz") ? "km/soat" : "км/ч";
    const egoLabel = (window.v2xAudio && window.v2xAudio.currentLanguage === "uz") ? `Siz • ${Math.round(speed)} ${speedUnit}` : `Вы • ${Math.round(speed)} ${speedUnit}`;

    const icon = this._createVehicleIcon(egoLabel, heading, true, safetyLevel, speed);

    if (!this.egoMarker) {
      this.egoMarker = L.marker(latlng, { icon: icon, zIndexOffset: 1000 }).addTo(this.map);
    } else {
      this.egoMarker.setLatLng(latlng);
      this.egoMarker.setIcon(icon);
    }

    if (this.radarCircle) {
      this.radarCircle.setLatLng(latlng);
      if (safetyLevel === 'RED') {
        this.radarCircle.setStyle({ color: '#ff1744', fillColor: '#ff1744', fillOpacity: 0.12 });
      } else if (safetyLevel === 'YELLOW') {
        this.radarCircle.setStyle({ color: '#ffb300', fillColor: '#ffb300', fillOpacity: 0.08 });
      } else {
        this.radarCircle.setStyle({ color: '#00e676', fillColor: '#00e676', fillOpacity: 0.04 });
      }
    }

    if (this.followEgo) {
      this.map.panTo(latlng, { animate: true, duration: 0.1 });
    }
  }

  updateNeighbors(neighbors, egoLat, egoLon, threatVehicleId) {
    if (!this.map) return;

    const currentVids = new Set();
    let collisionTargetCoords = null;
    const speedUnit = (window.v2xAudio && window.v2xAudio.currentLanguage === "uz") ? "km/s" : "км/ч";

    for (const n of neighbors) {
      currentVids.add(n.vehicle_id);
      const latlng = [n.lat, n.lon];
      const label = `${n.vehicle_id} • ${Math.round(n.speed)} ${speedUnit}`;
      const icon = this._createVehicleIcon(label, n.heading, false, n.threat_level, n.speed);

      if (this.neighborMarkers.has(n.vehicle_id)) {
        const marker = this.neighborMarkers.get(n.vehicle_id);
        marker.setLatLng(latlng);
        marker.setIcon(icon);
      } else {
        const marker = L.marker(latlng, { icon: icon, zIndexOffset: 500 }).addTo(this.map);
        this.neighborMarkers.set(n.vehicle_id, marker);
      }

      // Прогнозные векторы движения соседа
      if (n.trajectory && n.trajectory.length > 0) {
        const trajCoords = [[n.lat, n.lon]];
        for (const pt of n.trajectory) {
          trajCoords.push([pt.lat, pt.lon]);
        }

        let lineColor = "#38bdf8";
        if (n.threat_level === "YELLOW") lineColor = "#ffb300";
        if (n.threat_level === "RED") lineColor = "#ff1744";

        if (this.trajectoryLines.has(n.vehicle_id)) {
          const poly = this.trajectoryLines.get(n.vehicle_id);
          poly.setLatLngs(trajCoords);
          poly.setStyle({ color: lineColor });
        } else {
          const poly = L.polyline(trajCoords, {
            color: lineColor,
            weight: 3.5,
            dashArray: '6, 6',
            opacity: 0.9
          }).addTo(this.map);
          this.trajectoryLines.set(n.vehicle_id, poly);
        }
      }

      if (n.vehicle_id === threatVehicleId && (n.threat_level === "RED" || n.threat_level === "YELLOW")) {
        collisionTargetCoords = latlng;
      }
    }

    // Удаление ТС, покинувших радиус видимости
    for (const [vid, marker] of this.neighborMarkers.entries()) {
      if (!currentVids.has(vid)) {
        this.map.removeLayer(marker);
        this.neighborMarkers.delete(vid);

        if (this.trajectoryLines.has(vid)) {
          this.map.removeLayer(this.trajectoryLines.get(vid));
          this.trajectoryLines.delete(vid);
        }
      }
    }

    // Отрисовка пульсирующего луча опасности столкновения между машинами
    if (collisionTargetCoords && egoLat && egoLon) {
      const rayPoints = [[egoLat, egoLon], collisionTargetCoords];
      if (!this.collisionRay) {
        this.collisionRay = L.polyline(rayPoints, {
          color: '#ff1744',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.95
        }).addTo(this.map);
      } else {
        this.collisionRay.setLatLngs(rayPoints);
      }
    } else if (this.collisionRay) {
      this.map.removeLayer(this.collisionRay);
      this.collisionRay = null;
    }
  }

  panTo(lat, lon, zoom) {
    if (this.map) {
      this.map.setView([lat, lon], zoom || 17);
    }
  }

  setFollowEgo(enabled) {
    this.followEgo = enabled;
  }
}

window.v2xMap = new V2XMapController('map-container');
