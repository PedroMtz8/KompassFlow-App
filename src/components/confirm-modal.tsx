import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Rojo para acciones que no se pueden deshacer. */
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Contenido extra entre el mensaje y los botones (opciones, contraseña…). */
  children?: React.ReactNode;
};

/**
 * Ventana de confirmación para acciones delicadas (quitar a alguien, traspasar la academia). Se cierra al tocar fuera o con
 * «Cancelar»; mientras `busy` no se puede cerrar. Funciona igual en web, iOS y Android.
 */
export function ConfirmModal({ visible, title, message, confirmLabel, cancelLabel = 'Cancelar', destructive = true, busy, confirmDisabled, onConfirm, onCancel, children }: ConfirmModalProps) {
  const close = () => {
    if (!busy) onCancel();
  };
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable onPress={close} className="flex-1 items-center justify-center bg-black/50 px-5" accessibilityLabel="Cerrar">
        {/* Este Pressable absorbe los toques para que tocar dentro de la ventana no la cierre. */}
        <Pressable onPress={() => {}} className="max-h-[85%] w-full max-w-[420px] rounded-[26px] bg-card p-5" accessibilityRole="alert">
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3">
            <Text className="text-[17px] font-extrabold tracking-[-0.02em]">{title}</Text>
            {message ? <Text variant="muted" className="text-[13.5px] leading-5">{message}</Text> : null}
            {children}
            <View className="gap-2 pt-1">
              <Button size="lg" variant={destructive ? 'destructive' : 'default'} disabled={busy || confirmDisabled} onPress={onConfirm}>
                {busy ? <ActivityIndicator color="#fff" /> : null}
                <Text className="text-[15.5px]">{confirmLabel}</Text>
              </Button>
              <Button size="lg" variant="secondary" disabled={busy} onPress={close}>
                <Text className="text-[15.5px]">{cancelLabel}</Text>
              </Button>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
