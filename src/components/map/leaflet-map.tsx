import L from 'leaflet';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import { TEPIC_CENTER, usePinColors, type MapPin, type PlacesMapProps } from './types';

/**
 * Mapa web con Leaflet + OpenStreetMap. Importa Leaflet de forma estática, así que SOLO se carga en el
 * navegador (vía `places-map.web.tsx`): Leaflet usa `window` y el render de servidor no lo tiene.
 * Las teselas de OSM sirven para desarrollo; en producción usa un proveedor con plan (MapTiler, Stadia…).
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const pinIcon = (color: string, selected: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="width:${selected ? 28 : 22}px;height:${selected ? 28 : 22}px;background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(27,22,32,.35)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });

function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  const key = pins.map((p) => `${p.id}:${p.lat}:${p.lng}`).join('|');
  useEffect(() => {
    if (!pins.length) return;
    if (pins.length === 1) map.setView([pins[0].lat, pins[0].lng], 15);
    else
      map.fitBounds(
        pins.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [40, 40], maxZoom: 16 }
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export default function LeafletMap({ pins, selectedId, onSelect, user, height = 240, interactive = true }: PlacesMapProps) {
  const colors = usePinColors();
  return (
    <MapContainer
      center={[TEPIC_CENTER.lat, TEPIC_CENTER.lng]}
      zoom={13}
      style={{ width: '100%', height: typeof height === 'number' ? height : '100%' }}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      zoomControl={interactive}
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <FitBounds pins={pins} />
      {pins.map((p) => {
        const selected = p.id === selectedId;
        return (
          <Marker
            key={`${p.id}:${selected}`}
            position={[p.lat, p.lng]}
            icon={pinIcon(selected ? colors.selected : colors.pin, selected)}
            eventHandlers={{ click: () => onSelect?.(p.id) }}
            title={p.title}
          />
        );
      })}
      {user ? (
        <CircleMarker
          center={[user.lat, user.lng]}
          radius={8}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#0077C8', fillOpacity: 1 }}
        />
      ) : null}
    </MapContainer>
  );
}
