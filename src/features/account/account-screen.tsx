import { Screen, ScreenScroll } from '@/components/screen';
import { ScreenHeader } from '@/components/ui/screen-header';

import { AccountSection } from './account-section';

/** Configuración de la cuenta (foto, contraseña, Google, avisos, privacidad, cerrar sesión). Se llega desde Perfil (alumno) y desde Más (dueño o equipo). */
export function AccountScreen() {
  return (
    <Screen>
      <ScreenHeader title="Configuración" />
      <ScreenScroll contentContainerClassName="gap-3 pb-6">
        <AccountSection />
      </ScreenScroll>
    </Screen>
  );
}
