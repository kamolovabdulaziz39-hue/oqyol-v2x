/**
 * Interactive V2X Map Controller (Uzbekistan / Tashkent & Real GPS).
 * Features OpenStreetMap navigation, ESRI Satellite, realistic automotive SVGs,
 * forward headlight beams, velocity vectors, and radar safety zones.
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

    // Центр по умолчанию: Ташкент, Узбекистан (Сквер Амира Темура)
    this.defaultCenter = [41.311081, 69.279737];
    this.defaultZoom = 17;
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

    // 1. Стандартная подробная карта дорог OpenStreetMap (Узбекистан, все улицы и дома на русском/узбекском)
    const osmRoads = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });

    // 2. Спутниковые снимки высокого разрешения ESRI World Imagery
    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '© ESRI World Imagery'
    });

    // 3. Автомобильный темный навигатор (OSM с фильтром контраста)
    const darkNavigator = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-nav-tiles',
      attribution: '© OpenStreetMap | V2X Navigation'
    });

    // По умолчанию включаем темный навигатор
    darkNavigator.addTo(this.map);

    // Добавляем переключатель слоев в верхний правый угол
    const baseMaps = {
      "🌙 Темный навигатор": darkNavigator,
      "🗺️ Дороги (OpenStreetMap)": osmRoads,
      "🛰️ Спутник (ESRI)": esriSatellite
    };
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(this.map);

    // Зум-контрол в правом нижнем углу
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Радарная зона безопасности вокруг собственного ТС (радиус 150 м)
    this.radarCircle = L.circle(this.defaultCenter, {
      radius: 120,
      color: '#00ff88',
      weight: 1.5,
      dashArray: '4, 8',
      fillColor: '#00ff88',
      fillOpacity: 0.05
    }).addTo(this.map);

    this.isInitialized = true;
  }

  _getRealisticCarSVG(isEgo, threatLevel, speed) {
    let bodyColor = isEgo ? "#00e676" : "#2979ff";
    let glowColor = isEgo ? "rgba(0, 230, 118, 0.6)" : "rgba(41, 121, 255, 0.4)";
    let headlightColor = "#ffffff";

    if (threatLevel === "YELLOW") {
      bodyColor = "#ffb300";
      glowColor = "rgba(255, 179, 0, 0.7)";
      headlightColor = "#ffeb3b";
    } else if (threatLevel === "RED") {
      bodyColor = "#ff1744";
      glowColor = "rgba(255, 23, 68, 0.9)";
      headlightColor = "#ff5252";
    }

    return `
      <div class="realistic-car-container" style="filter: drop-shadow(0 0 10px ${glowColor});">
        <!-- Лучи передних фар на асфальт -->
        <div class="headlight-beam" style="
          position: absolute;
          top: -38px;
          left: 50%;
          transform: translateX(-50%);
          width: 36px;
          height: 42px;
          background: radial-gradient(ellipse at 50% 100%, ${headlightColor} 0%, rgba(255,255,255,0.2) 40%, transparent 80%);
          pointer-events: none;
          opacity: 0.85;
          clip-path: polygon(25% 100%, 75% 100%, 100% 0%, 0% 0%);
        "></div>

        <!-- Детализированный векторный кузов автомобиля (Top-Down View) -->
        <svg width="34" height="60" viewBox="0 0 34 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Тень колес -->
          <rect x="0" y="8" width="4" height="12" rx="2" fill="#111" />
          <rect x="30" y="8" width="4" height="12" rx="2" fill="#111" />
          <rect x="0" y="40" width="4" height="12" rx="2" fill="#111" />
          <rect x="30" y="40" width="4" height="12" rx="2" fill="#111" />

          <!-- Кузов автомобиля -->
          <path d="M5 14C5 7 10 2 17 2C24 2 29 7 29 14V46C29 53 25 58 17 58C9 58 5 53 5 46V14Z" 
                fill="${bodyColor}" stroke="#ffffff" stroke-width="1.8"/>

          <!-- Передний капот и рельеф -->
          <path d="M8 12C8 7 12 5 17 5C22 5 26 7 26 12V16H8V12Z" fill="rgba(0,0,0,0.18)"/>

          <!-- Лобовое стекло -->
          <path d="M8 18C8 16 12 15 17 15C22 15 26 16 26 18V25C26 26 24 27 17 27C10 27 8 26 8 25V18Z" 
                fill="#1a2634" stroke="#4fc3f7" stroke-width="0.8"/>
          <!-- Блик на стекле -->
          <path d="M10 18L24 23" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>

          <!-- Крыша / Люк -->
          <rect x="9" y="28" width="16" height="13" rx="3" fill="rgba(0,0,0,0.25)"/>

          <!-- Заднее стекло -->
          <path d="M8 43C8 42 12 41 17 41C22 41 26 42 26 43V47C26 48 22 49 17 49C12 49 8 48 8 47V43Z" 
                fill="#1a2634"/>

          <!-- Боковые зеркала -->
          <rect x="1" y="16" width="3" height="6" rx="1.5" fill="${bodyColor}" stroke="#fff" stroke-width="0.8"/>
          <rect x="30" y="16" width="3" height="6" rx="1.5" fill="${bodyColor}" stroke="#fff" stroke-width="0.8"/>

          <!-- Передние фары -->
          <circle cx="9" cy="4" r="2.2" fill="#fff" />
          <circle cx="25" cy="4" r="2.2" fill="#fff" />

          <!-- Задние стоп-сигналы -->
          <rect x="8" y="55" width="5" height="2" rx="1" fill="#ff1744"/>
          <rect x="21" y="55" width="5" height="2" rx="1" fill="#ff1744"/>
        </svg>
      </div>
    `;
  }

  _createVehicleIcon(label, heading, isEgo, threatLevel, speed) {
    const rot = Math.round(heading || 0);
    const carHtml = this._getRealisticCarSVG(isEgo, threatLevel, speed);

    const badgeColor = isEgo ? '#00e676' : (threatLevel === 'RED' ? '#ff1744' : (threatLevel === 'YELLOW' ? '#ffb300' : '#2979ff'));

    const html = `
      <div class="vehicle-marker-wrapper" style="transform: rotate(${rot}deg);">
        ${carHtml}
        <!-- Информационная плашка над машиной (всегда ориентирована горизонтально) -->
        <div class="vehicle-plate" style="
          position: absolute;
          bottom: -22px;
          left: 50%;
          transform: translateX(-50%) rotate(-${rot}deg);
          white-space: nowrap;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace;
          font-size: 11px;
          font-weight: 700;
          color: #ffffff;
          background: rgba(10, 14, 22, 0.92);
          padding: 2px 7px;
          border-radius: 6px;
          border: 1px solid ${badgeColor};
          box-shadow: 0 4px 12px rgba(0,0,0,0.7);
          pointer-events: none;
        ">${label}</div>
      </div>
    `;

    return L.divIcon({
      html: html,
      className: 'custom-car-div-icon',
      iconSize: [40, 70],
      iconAnchor: [20, 35]
    });
  }

  updateEgo(lat, lon, heading, speed, safetyLevel) {
    if (!this.map) return;

    const latlng = [lat, lon];
    const label = `Вы • ${Math.round(speed)} км/ч`;
    const icon = this._createVehicleIcon(label, heading, true, safetyLevel, speed);

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

    for (const n of neighbors) {
      currentVids.add(n.vehicle_id);
      const latlng = [n.lat, n.lon];
      const label = `${n.vehicle_id} • ${Math.round(n.speed)} км/ч`;
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

        let lineColor = "#2979ff";
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
