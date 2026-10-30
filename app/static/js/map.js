/**
 * Interactive V2X Map Controller (Leaflet + Smooth Canvas Overlay).
 * Renders ego vehicle, peer vehicles, trajectory vectors, collision hazard rays, and blind spot cones.
 */

class V2XMapController {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.egoMarker = null;
    this.neighborMarkers = new Map();
    this.trajectoryLines = new Map();
    this.collisionRay = null;
    this.followEgo = true;
    this.isInitialized = false;

    this.defaultCenter = [55.751244, 37.618423];
    this.defaultZoom = 17;
  }

  init() {
    if (this.isInitialized || !window.L) return;

    // Инициализация карты Leaflet
    this.map = L.map(this.containerId, {
      center: this.defaultCenter,
      zoom: this.defaultZoom,
      zoomControl: false,
      attributionControl: false
    });

    // Темная контрастная тема карты (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(this.map);

    // Добавляем контрол зума в правый нижний угол
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.isInitialized = true;
  }

  _createVehicleIcon(label, heading, isEgo, threatLevel) {
    const rot = Math.round(heading || 0);
    let iconClass = isEgo ? "ego-car-icon" : "neighbor-car-icon";
    if (threatLevel === "YELLOW") iconClass += " threat-yellow";
    if (threatLevel === "RED") iconClass += " threat-red";

    const html = `
      <div class="vehicle-marker" style="transform: rotate(${rot}deg);">
        <div class="${iconClass}"></div>
        <div style="
          position: absolute;
          bottom: -18px;
          white-space: nowrap;
          font-size: 11px;
          font-weight: 700;
          color: #ffffff;
          background: rgba(0,0,0,0.75);
          padding: 1px 4px;
          border-radius: 4px;
          transform: rotate(-${rot}deg);
        ">${label}</div>
      </div>
    `;

    return L.divIcon({
      html: html,
      className: '',
      iconSize: [30, 44],
      iconAnchor: [15, 22]
    });
  }

  updateEgo(lat, lon, heading, speed, safetyLevel) {
    if (!this.map) return;

    const latlng = [lat, lon];
    const icon = this._createVehicleIcon("Вы", heading, true, safetyLevel);

    if (!this.egoMarker) {
      this.egoMarker = L.marker(latlng, { icon: icon }).addTo(this.map);
    } else {
      this.egoMarker.setLatLng(latlng);
      this.egoMarker.setIcon(icon);
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
      const label = `${n.vehicle_id} (${Math.round(n.speed)} км/ч)`;
      const icon = this._createVehicleIcon(label, n.heading, false, n.threat_level);

      if (this.neighborMarkers.has(n.vehicle_id)) {
        const marker = this.neighborMarkers.get(n.vehicle_id);
        marker.setLatLng(latlng);
        marker.setIcon(icon);
      } else {
        const marker = L.marker(latlng, { icon: icon }).addTo(this.map);
        this.neighborMarkers.set(n.vehicle_id, marker);
      }

      // Отрисовка прогнозной траектории соседа
      if (n.trajectory && n.trajectory.length > 0) {
        const trajCoords = [[n.lat, n.lon]];
        for (const pt of n.trajectory) {
          trajCoords.push([pt.lat, pt.lon]);
        }

        let lineColor = "#3a82f7";
        if (n.threat_level === "YELLOW") lineColor = "#ffb700";
        if (n.threat_level === "RED") lineColor = "#ff003c";

        if (this.trajectoryLines.has(n.vehicle_id)) {
          const poly = this.trajectoryLines.get(n.vehicle_id);
          poly.setLatLngs(trajCoords);
          poly.setStyle({ color: lineColor });
        } else {
          const poly = L.polyline(trajCoords, {
            color: lineColor,
            weight: 3,
            dashArray: '6, 6',
            opacity: 0.85
          }).addTo(this.map);
          this.trajectoryLines.set(n.vehicle_id, poly);
        }
      }

      if (n.vehicle_id === threatVehicleId && (n.threat_level === "RED" || n.threat_level === "YELLOW")) {
        collisionTargetCoords = latlng;
      }
    }

    // Удаление ТС, покинувших зону видимости
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

    // Отрисовка луча опасности сближения между Ego и машиной-угрозой
    if (collisionTargetCoords && egoLat && egoLon) {
      const rayPoints = [[egoLat, egoLon], collisionTargetCoords];
      if (!this.collisionRay) {
        this.collisionRay = L.polyline(rayPoints, {
          color: '#ff003c',
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

  setFollowEgo(enabled) {
    this.followEgo = enabled;
  }
}

window.v2xMap = new V2XMapController('map-container');
