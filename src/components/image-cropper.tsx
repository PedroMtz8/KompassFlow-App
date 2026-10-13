import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { done } from '@/lib/simulate';
import { useCropper, type CropRequest } from '@/stores/cropper';

const MAX_ZOOM = 5;
const clamp = (v: number, min: number, max: number) => {
  'worklet';
  return Math.min(Math.max(v, min), max);
};

/** Recortador: se arrastra y se acerca la imagen dentro de un marco con la proporción pedida. */
function CropperBody({
  req,
  onClose,
}: {
  req: CropRequest & { resolve: (r: null | { uri: string; name: string; type: string }) => void };
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [busy, setBusy] = useState(false);

  // Marco visible: ancho de la pantalla (máx. 520) y alto según la proporción.
  const fw = Math.min(win.width - 40, 520, (win.height - 320) * req.aspect);
  const fh = fw / req.aspect;
  // Escala mínima: la imagen siempre cubre el marco (sin bordes vacíos).
  const base = Math.max(fw / req.width, fh / req.height);

  const zoom = useSharedValue(1);
  const tx = useSharedValue((fw - req.width * base) / 2);
  const ty = useSharedValue((fh - req.height * base) / 2);
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  /** Deja la imagen cubriendo el marco: ninguna esquina del marco queda fuera de la foto. */
  const fit = (z: number, x: number, y: number) => {
    'worklet';
    const w = req.width * base * z;
    const h = req.height * base * z;
    return { x: clamp(x, fw - w, 0), y: clamp(y, fh - h, 0) };
  };

  /** Cambia el zoom manteniendo fijo el centro del marco. */
  const zoomTo = (next: number) => {
    'worklet';
    const z = clamp(next, 1, MAX_ZOOM);
    const cx = (fw / 2 - tx.get()) / (base * zoom.get());
    const cy = (fh / 2 - ty.get()) / (base * zoom.get());
    const p = fit(z, fw / 2 - cx * base * z, fh / 2 - cy * base * z);
    zoom.set(z);
    tx.set(p.x);
    ty.set(p.y);
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.set(tx.get());
      startY.set(ty.get());
    })
    .onUpdate((e) => {
      const p = fit(zoom.get(), startX.get() + e.translationX, startY.get() + e.translationY);
      tx.set(p.x);
      ty.set(p.y);
    });
  const pinch = Gesture.Pinch()
    .onStart(() => startZoom.set(zoom.get()))
    .onUpdate((e) => zoomTo(startZoom.get() * e.scale));

  const imageStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: tx.get(),
    top: ty.get(),
    width: req.width * base * zoom.get(),
    height: req.height * base * zoom.get(),
  }));

  const step = (delta: number) => {
    const next = clamp(zoom.get() + delta, 1, MAX_ZOOM);
    const cx = (fw / 2 - tx.get()) / (base * zoom.get());
    const cy = (fh / 2 - ty.get()) / (base * zoom.get());
    const w = req.width * base * next;
    const h = req.height * base * next;
    zoom.set(withTiming(next, { duration: 120 }));
    tx.set(withTiming(clamp(fw / 2 - cx * base * next, fw - w, 0), { duration: 120 }));
    ty.set(withTiming(clamp(fh / 2 - cy * base * next, fh - h, 0), { duration: 120 }));
  };

  const confirm = async () => {
    setBusy(true);
    try {
      // Región visible en píxeles de la imagen original.
      const scale = base * zoom.get();
      const width = Math.min(Math.round(fw / scale), req.width);
      const height = Math.min(Math.round(fh / scale), req.height);
      const originX = Math.min(Math.max(Math.round(-tx.get() / scale), 0), req.width - width);
      const originY = Math.min(Math.max(Math.round(-ty.get() / scale), 0), req.height - height);
      const ctx = ImageManipulator.manipulate(req.uri).crop({ originX, originY, width, height });
      // No se agranda: si el recorte es más chico que el tamaño final, queda como está.
      const rendered = await (width > req.outputWidth ? ctx.resize({ width: req.outputWidth }) : ctx).renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      req.resolve({ uri: saved.uri, name: 'foto.jpg', type: 'image/jpeg' });
      onClose();
    } catch {
      done('No se pudo recortar la imagen.');
      setBusy(false);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#14101A' }}>
      <View className="flex-1 items-center" style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>
        <View className="w-full flex-row items-center justify-between px-5 pb-4">
          <Pressable
            onPress={() => {
              req.resolve(null);
              onClose();
            }}
            disabled={busy}
            hitSlop={10}
            className="active:opacity-70"
          >
            <Text className="text-[15px] font-bold text-white/80">Cancelar</Text>
          </Pressable>
          <Text className="text-[15px] font-extrabold text-white">{req.title}</Text>
          <Pressable onPress={confirm} disabled={busy} hitSlop={10} className="min-w-[60px] items-end active:opacity-70">
            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-[15px] font-extrabold text-primary">Listo</Text>}
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center">
          <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
            <View style={{ width: fw, height: fh, overflow: 'hidden', borderRadius: 16, backgroundColor: '#000' }}>
              <Animated.View style={imageStyle}>
                <Image source={{ uri: req.uri }} style={{ width: '100%', height: '100%' }} resizeMode="stretch" />
              </Animated.View>
              {/* Cuadrícula de tercios para encuadrar. */}
              <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
                {[1, 2].map((i) => (
                  <View
                    key={`v${i}`}
                    style={{
                      position: 'absolute',
                      left: (fw / 3) * i,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      backgroundColor: 'rgba(255,255,255,0.35)',
                    }}
                  />
                ))}
                {[1, 2].map((i) => (
                  <View
                    key={`h${i}`}
                    style={{
                      position: 'absolute',
                      top: (fh / 3) * i,
                      left: 0,
                      right: 0,
                      height: 1,
                      backgroundColor: 'rgba(255,255,255,0.35)',
                    }}
                  />
                ))}
                <View style={{ position: 'absolute', inset: 0, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 16 }} />
              </View>
            </View>
          </GestureDetector>
        </View>

        <View className="items-center gap-3 px-5 pt-4">
          <View className="flex-row items-center gap-5">
            <Pressable
              onPress={() => step(-0.5)}
              accessibilityLabel="Alejar"
              className="h-12 w-12 items-center justify-center rounded-full bg-white/15 active:opacity-70"
            >
              <Icon as={Minus} size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => step(0.5)}
              accessibilityLabel="Acercar"
              className="h-12 w-12 items-center justify-center rounded-full bg-white/15 active:opacity-70"
            >
              <Icon as={Plus} size={22} color="#fff" />
            </Pressable>
          </View>
          <Text className="text-center text-[13px] font-semibold text-white/70">
            Arrastra para mover · pellizca o usa − y + para acercar
          </Text>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

/** Se monta una sola vez en el layout raíz; se abre con `useCropper().crop(...)`. */
export function ImageCropperHost() {
  const request = useCropper((s) => s.request);
  const finish = useCropper((s) => s.finish);
  if (!request) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={() => finish(null)} presentationStyle="fullScreen" statusBarTranslucent>
      {/* `key` reinicia el estado (zoom y posición) para cada imagen nueva. */}
      <CropperBody key={request.uri} req={request} onClose={() => useCropper.setState({ request: null })} />
    </Modal>
  );
}
