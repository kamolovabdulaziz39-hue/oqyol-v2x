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
    this.fleetMarkers = new Map();
    this.trajectoryLines = new Map();
    this.collisionRay = null;
    this.radarMarkers = new Map();
    this.followEgo = true;
    this.lastEgoLatLng = null;
    this.recenterBtn = null;
    this.isInitialized = false;

    // Выбранный стиль автомобиля пользователя
    this.carModel = "cobalt"; // "cobalt" (Sedan), "tracker" (SUV), "chevron" (Tesla 3D)

    // Центр по умолчанию: Ташкент, Узбекистан (пр. Амира Темура / ул. Абдуллы Кадыри)
    this.defaultCenter = [41.31950, 69.28165];
    this.defaultZoom = 17;
  }

  setCarModel(model) {
    this.carModel = model;
    console.log("[V2X Map] Vehicle model set to:", model);
  }

  init() {
    if (this.isInitialized || !window.L) return;

    // Инициализация карты Leaflet с поддержкой ультра-зума до 22 уровня
    this.map = L.map(this.containerId, {
      center: this.defaultCenter,
      zoom: this.defaultZoom,
      maxZoom: 22,
      zoomControl: false,
      attributionControl: true
    });

    // 1. Google Hybrid: Yuqori sifatli sun'iy yo'ldosh + Shaharlar, ko'chalar, mahallalar va uylar nomi
    const googleHybrid = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 22,
      maxNativeZoom: 20,
      attribution: '© Google Satellite & Roads • OQ YO\'L Navigation'
    });

    // 2. Standart yorug' oq ko'chalar xaritasi (OpenStreetMap)
    const osmRoads = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap contributors'
    });

    // 3. ESRI Sun'iy yo'ldosh + Yo'llar va Joy nomlari (Hybrid)
    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20,
      maxNativeZoom: 18,
      attribution: '© ESRI World Imagery'
    });
    const esriRoads = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20,
      maxNativeZoom: 18,
      attribution: '© ESRI Transportation'
    });
    const esriPlaces = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20,
      maxNativeZoom: 18,
      attribution: '© ESRI Places'
    });
    const esriHybrid = L.layerGroup([esriSatellite, esriRoads, esriPlaces]);

    // 4. Tungi rejim (Qorong'i navigatsiya)
    const darkNavigator = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
      className: 'dark-nav-tiles',
      attribution: '© OpenStreetMap | OQ YO\'L Navigation'
    });

    // Sun'iy yo'ldosh Google Hybrid (shahar va ko'chalar ko'rinadigan qatlam) yoqiladi
    googleHybrid.addTo(this.map);

    // Qatlamlar almashtirgichi
    const baseMaps = {
      "🛰️ Sun'iy yo'ldosh (Google Hybrid + Shaharlar va ko'chalar)": googleHybrid,
      "🗺️ Oq Yo'l (Standart ko'chalar xaritasi)": osmRoads,
      "🛰️ ESRI Sun'iy yo'ldosh + Yo'llar": esriHybrid,
      "🌙 Tungi rejim (Qorong'i)": darkNavigator
    };
    L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(this.map);

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

    // Foydalanuvchi xaritani qo'l bilan sursa yoki boshqa ko'chalarni ko'rmoqchi bo'lsa:
    // Avtomobilga majburiy qaytarish to'xtatiladi va markazga qaytish tugmasi chiqadi
    this.map.on('dragstart', () => {
      this.followEgo = false;
      this._updateRecenterButton();
    });

    this.map.on('movestart', (e) => {
      if (e.originalEvent) {
        this.followEgo = false;
        this._updateRecenterButton();
      }
    });

    this._createRecenterButton();
    this.isInitialized = true;
  }

  _createRecenterButton() {
    if (this.recenterBtn) return;
    const btn = document.createElement("button");
    btn.id = "btn-map-recenter";
    btn.className = "map-floating-recenter-btn";
    btn.innerHTML = `<span>🎯</span> <span>Mashinaga qaytish</span>`;
    btn.title = "Avtomobilni xarita markaziga qaytarish";
    btn.style.display = "none";
    btn.onclick = () => {
      this.followEgo = true;
      if (this.lastEgoLatLng) {
        this.map.setView(this.lastEgoLatLng, Math.max(this.map.getZoom(), 17), { animate: true });
      }
      this._updateRecenterButton();
    };
    const mapContainer = document.getElementById(this.containerId);
    if (mapContainer) {
      mapContainer.appendChild(btn);
    }
    this.recenterBtn = btn;
  }

  _updateRecenterButton() {
    if (!this.recenterBtn) return;
    const isUz = !window.v2xAudio || window.v2xAudio.currentLanguage === "uz";
    this.recenterBtn.innerHTML = isUz 
      ? `<span>🎯</span> <span>Mashinaga qaytish</span>` 
      : `<span>🎯</span> <span>К автомобилю</span>`;
    this.recenterBtn.style.display = this.followEgo ? "none" : "inline-flex";
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

    this.lastEgoLatLng = latlng;

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

  /**
   * Отображение всех активных автомобилей платформы OQ YO'L AI по всему Узбекистану.
   * Водитель видит всю сеть платформы на любых улицах и при поездках в любые области.
   */
  updateAllFleet(fleetList, ownVehicleId) {
    if (!this.map || !fleetList) return;
    const currentFleetVids = new Set();
    const speedUnit = (window.v2xAudio && window.v2xAudio.currentLanguage === "uz") ? "km/s" : "км/ч";

    for (const v of fleetList) {
      if (v.vehicle_id === ownVehicleId) continue;
      currentFleetVids.add(v.vehicle_id);

      // Если автомобиль уже отрисован локальным высокоскоростным телеметрическим сокетом — не дублируем
      if (this.neighborMarkers.has(v.vehicle_id)) {
        if (this.fleetMarkers.has(v.vehicle_id)) {
          this.map.removeLayer(this.fleetMarkers.get(v.vehicle_id));
          this.fleetMarkers.delete(v.vehicle_id);
        }
        continue;
      }

      const latlng = [v.lat, v.lon];
      const statusColor = (v.status === "active") ? "#00e676" : "#ffb300";

      if (this.fleetMarkers.has(v.vehicle_id)) {
        const marker = this.fleetMarkers.get(v.vehicle_id);
        marker.setLatLng(latlng);
      } else {
        const icon = L.divIcon({
          className: 'custom-fleet-marker',
          html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%); cursor: pointer;">
              <div style="background: rgba(13, 20, 36, 0.92); border: 1.5px solid ${statusColor}; border-radius: 6px; padding: 2px 7px; color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; box-shadow: 0 0 10px ${statusColor}66; margin-bottom: 2px;">
                🚗 ${v.vehicle_plate || v.vehicle_id}
              </div>
              <div style="width: 14px; height: 14px; background: ${statusColor}; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 8px ${statusColor};"></div>
            </div>
          `,
          iconSize: [0, 0]
        });
        const marker = L.marker(latlng, { icon: icon, zIndexOffset: 350 }).addTo(this.map);
        marker.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; color: #1e293b; padding: 4px; line-height: 1.5;">
            <strong style="color: #059669; font-size: 13px;">🟢 OQ YO'L AI • Tarmoq Haydovchisi</strong><br>
            <b>Ism:</b> ${v.driver_name || 'Faol haydovchi'}<br>
            <b>Avtomobil:</b> ${v.vehicle_model || 'Chevrolet Cobalt'}<br>
            <b>Davlat raqami:</b> <span style="background: #e2e8f0; padding: 1px 5px; border-radius: 4px; font-family: monospace; font-weight: bold;">${v.vehicle_plate || v.vehicle_id}</span><br>
            <b>Shahar / Viloyat:</b> ${v.city || "O'zbekiston"}<br>
            <b>Ko'cha:</b> ${v.street || 'Trassa'}<br>
            <b>Harakat tezligi:</b> ${Math.round(v.speed || 0)} ${speedUnit}<br>
            <span style="display: inline-block; margin-top: 4px; color: #0284c7; font-size: 11px;">✓ V2X Tizimiga ulangan</span>
          </div>
        `);
        this.fleetMarkers.set(v.vehicle_id, marker);
      }
    }

    // Удаление ТС, покинувших сеть
    for (const [vid, marker] of this.fleetMarkers.entries()) {
      if (!currentFleetVids.has(vid)) {
        this.map.removeLayer(marker);
        this.fleetMarkers.delete(vid);
      }
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

  /**
   * Отрисовка стационарных дорожных радаров и камер фиксации скорости на карте
   */
  updateRadars(radars) {
    if (!this.map || !radars) return;

    const currentIds = new Set();
    for (const r of radars) {
      if (!r.is_active) continue;
      currentIds.add(r.id);

      const latlng = [r.lat, r.lon];
      const speedLimit = r.speed_limit || 60;
      const typeLabel = r.type_name || "Радар скорости";

      if (this.radarMarkers.has(r.id)) {
        // Радар уже на карте
        continue;
      }

      // Создаем кастомный маркер дорожного знака радара
      const radarHtml = `
        <div class="radar-station-marker" id="radar-marker-${r.id}" title="${r.name}">
          <div class="radar-scan-ping"></div>
          <div class="radar-sign-badge">
            <span class="radar-cam-icon">📷</span>
            <span class="radar-limit-num">${speedLimit}</span>
          </div>
          <div class="radar-label-tag">${r.name.length > 22 ? r.name.substring(0, 20) + '...' : r.name}</div>
        </div>
      `;

      const icon = L.divIcon({
        html: radarHtml,
        className: 'custom-radar-div-icon',
        iconSize: [44, 52],
        iconAnchor: [22, 26]
      });

      const marker = L.marker(latlng, { icon: icon, zIndexOffset: 300 }).addTo(this.map);
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; color: #0f172a; min-width: 200px;">
          <div style="font-weight: 800; font-size: 14px; margin-bottom: 6px; color: #b91c1c;">📷 ${r.name}</div>
          <div style="margin-bottom: 4px;">⚡ <strong>Ограничение:</strong> <span style="background: #dc2626; color: #fff; padding: 2px 7px; border-radius: 10px; font-weight: 800;">${speedLimit} км/ч</span></div>
          <div style="margin-bottom: 4px; color: #475569;">📍 <strong>Тип:</strong> ${typeLabel}</div>
          <div style="margin-bottom: 4px; color: #475569;">🧭 <strong>Направление:</strong> ${r.direction || 'Все направления'}</div>
          ${r.description ? `<div style="font-size: 11px; color: #64748b; margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 4px;">${r.description}</div>` : ''}
        </div>
      `);

      this.radarMarkers.set(r.id, marker);
    }

    // Удаляем неактивные
    for (const [id, marker] of this.radarMarkers.entries()) {
      if (!currentIds.has(id)) {
        this.map.removeLayer(marker);
        this.radarMarkers.delete(id);
      }
    }
  }

  highlightRadar(radarId, isCritical = false, egoPos = null, radarPos = null) {
    const el = document.getElementById(`radar-marker-${radarId}`);
    if (el) {
      if (isCritical) {
        el.classList.add("radar-critical-pulse");
      } else {
        el.classList.add("radar-active-pulse");
      }
    }

    if (this.map && egoPos && radarPos) {
      if (!this.radarBeamLine) {
        this.radarBeamLine = L.polyline([egoPos, radarPos], {
          color: isCritical ? '#ff1744' : '#ffb300',
          weight: isCritical ? 3.5 : 2.5,
          dashArray: '6, 8',
          opacity: 0.85
        }).addTo(this.map);
      } else {
        this.radarBeamLine.setLatLngs([egoPos, radarPos]);
        this.radarBeamLine.setStyle({
          color: isCritical ? '#ff1744' : '#ffb300',
          weight: isCritical ? 3.5 : 2.5
        });
      }
    }
  }

  clearRadarHighlights() {
    document.querySelectorAll(".radar-station-marker").forEach(el => {
      el.classList.remove("radar-critical-pulse", "radar-active-pulse");
    });
    if (this.radarBeamLine && this.map) {
      this.map.removeLayer(this.radarBeamLine);
      this.radarBeamLine = null;
    }
  }
}

window.v2xMap = new V2XMapController('map-container');
