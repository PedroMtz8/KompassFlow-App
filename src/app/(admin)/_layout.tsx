import { Tabs } from 'expo-router';
import { Building2, ChartNoAxesCombined, Ellipsis, ShieldCheck, Users } from 'lucide-react-native';

import { makeTabBar } from '@/components/tab-bar';

// «Planes» existe como ruta pero se abre desde Más (no cabe una sexta pestaña en el teléfono).
const TabBar = makeTabBar([
  { name: 'overview', label: 'Resumen', icon: ChartNoAxesCombined },
  { name: 'orgs', label: 'Academias', icon: Building2 },
  { name: 'verifications', label: 'Solicitudes', icon: ShieldCheck },
  { name: 'users', label: 'Usuarios', icon: Users },
  { name: 'settings', label: 'Más', icon: Ellipsis },
]);

/** Administración de la plataforma (solo para quien está en PLATFORM_ADMIN_EMAILS). */
export default function AdminLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="overview" />
      <Tabs.Screen name="orgs" />
      <Tabs.Screen name="verifications" />
      <Tabs.Screen name="users" />
      <Tabs.Screen name="plans" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
