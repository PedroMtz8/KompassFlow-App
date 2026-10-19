import * as Updates from 'expo-updates';
import Storage from 'expo-sqlite/kv-store';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Download from 'lucide-react-native/icons/download';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/components/offline-banner';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useToast } from '@/stores/toast';

const LAST_ID_KEY = 'kf-last-update-id';
const CHECK_EVERY = 10 * 60 * 1000;

/**
 * Aviso de actualizaciones (OTA): se busca al abrir y al volver a la app, se muestra el progreso de la descarga
 * y, al terminar, se ofrece reiniciar para aplicarla. Tras reiniciar confirma que ya se aplicó.
 */
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const u = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);

  // Al volver a la app se busca otra vez (sin pasarse: como máximo una vez cada 10 min).
  useEffect(() => {
    if (!Updates.isEnabled) return;
    const check = () => {
      if (!online || Date.now() - lastCheck.current < CHECK_EVERY) return;
      lastCheck.current = Date.now();
      Updates.checkForUpdateAsync().catch(() => {});
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [online]);

  // Hay una nueva y no se está bajando: se descarga.
  useEffect(() => {
    if (Updates.isEnabled && online && u.isUpdateAvailable && !u.isDownloading && !u.isUpdatePending && !u.downloadError) {
      Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [online, u.isUpdateAvailable, u.isDownloading, u.isUpdatePending, u.downloadError]);

  // Tras reiniciar: si la versión en uso cambió respecto a la última vez, se confirma que se aplicó.
  const runningId = u.currentlyRunning.updateId;
  useEffect(() => {
    if (!Updates.isEnabled || !runningId) return;
    const prev = Storage.getItemSync(LAST_ID_KEY);
    if (prev && prev !== runningId) useToast.getState().show('Actualización aplicada');
    Storage.setItemSync(LAST_ID_KEY, runningId);
  }, [runningId]);

  if (!Updates.isEnabled) return null;

  const pct = Math.round((u.downloadProgress ?? 0) * 100);
  let body: { icon: typeof Download; text: string; action?: { label: string; run: () => void }; progress?: number; tone?: 'ok' | 'warn' } | null = null;
  if (u.isRestarting) body = { icon: Download, text: 'Reiniciando…' };
  else if (u.isDownloading) body = { icon: Download, text: `Descargando actualización… ${pct}%`, progress: u.downloadProgress ?? 0 };
  else if (u.isUpdatePending && !dismissed)
    body = { icon: CircleCheck, text: 'Actualización lista', tone: 'ok', action: { label: 'Reiniciar', run: () => Updates.reloadAsync().catch(() => {}) } };
  else if (u.downloadError && online)
    body = { icon: TriangleAlert, text: 'No se pudo descargar la actualización', tone: 'warn', action: { label: 'Reintentar', run: () => Updates.fetchUpdateAsync().catch(() => {}) } };
  if (!body) return null;

  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 bottom-0 items-center px-4" style={{ paddingBottom: insets.bottom + 92 }}>
      <View className="w-full max-w-[420px] gap-2 rounded-2xl bg-ink px-3.5 py-3 shadow-[0_10px_30px_rgba(27,22,32,0.25)]">
        <View className="flex-row items-center gap-2.5">
          <Icon as={body.icon} size={16} color={body.tone === 'warn' ? '#F5B544' : body.tone === 'ok' ? '#35C4A6' : '#fff'} />
          <Text className="flex-1 text-[13px] font-bold text-white">{body.text}</Text>
          {body.action ? (
            <Pressable onPress={body.action.run} className="rounded-full bg-white px-3 py-1.5 active:opacity-80">
              <Text className="text-xs font-extrabold text-ink">{body.action.label}</Text>
            </Pressable>
          ) : null}
          {u.isUpdatePending && !u.isRestarting && !u.isDownloading ? (
            <Pressable onPress={() => setDismissed(true)} className="px-1 py-1.5 active:opacity-70">
              <Text className="text-xs font-bold text-white/70">Después</Text>
            </Pressable>
          ) : null}
        </View>
        {body.progress !== undefined ? (
          <View className="h-1.5 overflow-hidden rounded-full bg-white/20">
            <View className="h-full rounded-full bg-white" style={{ width: `${Math.max(4, Math.round(body.progress * 100))}%` }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
