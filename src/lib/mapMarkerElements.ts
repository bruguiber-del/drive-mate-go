// Pure DOM-element builders for MapView's Mapbox markers. Each function
// takes plain data and returns a detached <div>, with no Mapbox/React
// dependency, so the markup itself can be unit tested without a live map.

import { ROUTE_COLOR } from './mapGeoJSON';

export const WAYPOINT_COLORS: Record<string, string> = {
  meeting_point: 'hsl(280, 70%, 55%)',
  pickup: 'hsl(24, 95%, 53%)',          // 🟧 Naranja — Parada 1 / Recogida
  dropoff: 'hsl(142, 71%, 45%)',         // 🟩 Verde — Destino pasajero (bandera)
  final_destination: 'hsl(199, 89%, 48%)',
};

export const WAYPOINT_LABELS: Record<string, string> = {
  meeting_point: 'Punto de encuentro',
  pickup: 'Parada 1 — Recogida',
  dropoff: 'Destino pasajero',
  final_destination: 'Destino',
};

export const WAYPOINT_ICONS: Record<string, string> = {
  meeting_point:
    '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 4.5a2.5 2.5 0 010 5 2.5 2.5 0 010-5z"/>',
  // Person icon for pickup (Parada 1)
  pickup:
    '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  // Flag icon for dropoff
  dropoff: '<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>',
  final_destination: '<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>',
};

export const buildMarkerEl = (color: string, iconPath: string, label?: string, dashed = false) => {
  const el = document.createElement('div');
  el.style.pointerEvents = 'auto';
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;${dashed ? 'opacity:0.85;' : ''}">
      <div style="
        width:34px;height:34px;border-radius:9999px;
        display:flex;align-items:center;justify-content:center;
        background:${color};
        box-shadow:0 4px 14px rgba(0,0,0,0.4);
        ${dashed ? 'border:2px dashed white;' : 'border:2px solid white;'}
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">${iconPath}</svg>
      </div>
      ${
        label
          ? `<span data-marker-label style="
              margin-top:4px;font-size:10px;font-weight:600;
              padding:2px 8px;border-radius:9999px;color:white;
              background:${color};white-space:nowrap;
              box-shadow:0 2px 6px rgba(0,0,0,0.3);
            ">${label}</span>`
          : ''
      }
    </div>`;
  return el;
};

export const buildUserMarkerEl = (showRoute: boolean, heading: number) => {
  const el = document.createElement('div');
  el.style.pointerEvents = 'none';
  if (showRoute) {
    el.innerHTML = `
      <div style="transform: rotate(${heading}deg);">
        <div style="
          width:30px;height:30px;border-radius:9999px;
          background:${ROUTE_COLOR};border:2px solid white;
          box-shadow:0 4px 12px rgba(0,0,0,0.5);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </div>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="position:relative;">
        <div style="
          width:20px;height:20px;border-radius:9999px;
          background:${ROUTE_COLOR};border:2px solid white;
          box-shadow:0 4px 12px rgba(0,0,0,0.5);
        "></div>
      </div>`;
  }
  return el;
};

export const buildDriverMarkerEl = () => {
  const el = document.createElement('div');
  el.innerHTML = `
    <div style="
      width:40px;height:40px;border-radius:9999px;
      background:hsl(142,71%,45%);border:3px solid white;
      box-shadow:0 4px 14px rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
    </div>`;
  return el;
};
