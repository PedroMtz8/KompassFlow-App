import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Text } from '@/components/ui/text';

import { NativeMap } from './native-map';
import { TEPIC_CENTER, usePinColors, type PlacesMapProps } from './types';

/**
 * Mapa en Android. Primero Google Maps nativo (`react-native-maps`): en Expo Go funciona sin configurar nada y en una build
 * propia necesita la llave de Google Maps (plugin `react-native-maps`). Si en 8 segundos no termina de pintar (sin llave,
 * sin Google Play Services, emulador sin gráficos…) se cambia solo a OpenStreetMap con Leaflet dentro de un WebView, que
 * no pide llave. Si tampoco carga, se muestra un mensaje con el motivo en lugar de un recuadro gris vacío.
 * iOS usa Apple Maps y la web usa Leaflet directamente; todos comparten los mismos pines y colores.
 */
const html = (data: string) => `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0;background:#EDE7EE}.pin{border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(27,22,32,.35)}.me{border-radius:50%;background:#2F80ED;border:3px solid #fff;box-shadow:0 0 0 6px rgba(47,128,237,.25)}</style>
</head><body><div id="m"></div>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
function tell(o) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
window.onerror = function (m) { tell({ type: 'error', reason: String(m) }); };
if (typeof L === 'undefined') { tell({ type: 'error', reason: 'No se pudo descargar el mapa (sin conexión o bloqueado).' }); throw new Error('Leaflet no cargó'); }
var tileErrors = 0, tileOk = 0;
var map = L.map('m', { zoomControl: false, attributionControl: true }).setView([${TEPIC_CENTER.lat}, ${TEPIC_CENTER.lng}], 12);
var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
tiles.on('tileload', function () { if (++tileOk === 1) tell({ type: 'ready' }); });
tiles.on('tileerror', function () { if (++tileErrors === 4 && tileOk === 0) tell({ type: 'error', reason: 'El servidor de mapas no respondió.' }); });
var layer = L.layerGroup().addTo(map), meMarker = null, lastKey = '';
function dot(color, size) { return L.divIcon({ className: '', html: '<div class="pin" style="width:' + size + 'px;height:' + size + 'px;background:' + color + '"></div>', iconSize: [size, size], iconAnchor: [size / 2, size / 2] }); }
window.update = function (s) {
  layer.clearLayers();
  s.pins.forEach(function (p) {
    var sel = p.id === s.selectedId;
    L.marker([p.lat, p.lng], { icon: dot(sel ? s.colors.selected : s.colors.pin, sel ? 30 : 24), title: p.title })
      .on('click', function () { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'select', id: p.id })); })
      .addTo(layer);
  });
  if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
  if (s.user) meMarker = L.marker([s.user.lat, s.user.lng], { icon: L.divIcon({ className: '', html: '<div class="me" style="width:16px;height:16px"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
  var ifc = s.interactive;
  ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom', 'boxZoom', 'keyboard'].forEach(function (h) { ifc ? map[h].enable() : map[h].disable(); });
  var key = s.pins.map(function (p) { return p.id + ':' + p.lat + ':' + p.lng; }).join('|');
  if (key !== lastKey) {
    lastKey = key;
    if (s.pins.length === 1) map.setView([s.pins[0].lat, s.pins[0].lng], 16);
    else if (s.pins.length > 1) map.fitBounds(s.pins.map(function (p) { return [p.lat, p.lng]; }), { padding: [50, 50] });
  }
};
window.update(${data});
</script></body></html>`;

// `<` se escapa para que el JSON nunca pueda cerrar el <script>.
const safe = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

function OsmMap({ pins, selectedId, onSelect, user, height = 240, interactive = true }: PlacesMapProps) {
  const ref = useRef<WebView>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const colors = usePinColors();
  const state = useMemo(
    () => ({
      pins: pins.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title })),
      selectedId: selectedId ?? null,
      user: user ?? null,
      interactive,
      colors,
    }),
    [pins, selectedId, user, interactive, colors]
  );
  // El documento se carga una sola vez; los cambios llegan inyectando una llamada a `window.update`.
  const [initial] = useState(() => html(safe(state)));

  useEffect(() => {
    ref.current?.injectJavaScript(`window.update(${safe(state)}); true;`);
  }, [state]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type: string; id: string; reason?: string };
      if (m.type === 'select') onSelect?.(m.id);
      else if (m.type === 'ready') setFailed(null);
      else if (m.type === 'error') setFailed(m.reason ?? 'No se pudo cargar el mapa.');
    } catch {
      /* mensaje ajeno al mapa */
    }
  };

  return (
    <View style={{ width: '100%', height }}>
      <WebView
        key={attempt}
        ref={ref}
        onError={(e) => setFailed(e.nativeEvent.description || 'No se pudo cargar el mapa.')}
        onHttpError={(e) => setFailed(`El mapa respondió con error ${e.nativeEvent.statusCode}.`)}
        originWhitelist={['*']}
        source={{ html: initial, baseUrl: 'https://localhost' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        overScrollMode="never"
        setBuiltInZoomControls={false}
        scrollEnabled={false}
        style={{ flex: 1, backgroundColor: '#EDE7EE' }}
      />
      {failed ? (
        <Pressable
          onPress={() => {
            setFailed(null);
            setAttempt((n) => n + 1);
          }}
          className="absolute inset-0 items-center justify-center gap-1.5 bg-muted px-6"
        >
          <Text className="text-center text-[13px] font-bold">No pudimos cargar el mapa</Text>
          <Text variant="muted" className="text-center text-xs">
            {failed}
          </Text>
          <Text className="text-xs font-bold text-primary">Toca para reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const GOOGLE_TIMEOUT_MS = 8000;

export function PlacesMap(props: PlacesMapProps) {
  const [mode, setMode] = useState<'google' | 'osm'>('google');
  const loaded = useRef(false);

  // Si Google no termina de pintar a tiempo (sin llave, sin Play Services…) se usa OpenStreetMap.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded.current) setMode('osm');
    }, GOOGLE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  return mode === 'google' ? (
    <NativeMap
      {...props}
      onLoaded={() => {
        loaded.current = true;
      }}
    />
  ) : (
    <OsmMap {...props} />
  );
}
