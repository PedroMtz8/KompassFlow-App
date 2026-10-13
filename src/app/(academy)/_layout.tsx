import { Tabs } from 'expo-router';
import { CalendarDays, CreditCard, Ellipsis, House, Users } from 'lucide-react-native';

import { makeTabBar } from '@/components/tab-bar';

const TabBar = makeTabBar([
  { name: 'today', label: 'Hoy', icon: House },
  { name: 'schedule', label: 'Agenda', icon: CalendarDays },
  { name: 'students', label: 'Alumnos', icon: Users, perm: ['student', 'read'] },
  { name: 'payments', label: 'Pagos', icon: CreditCard, perm: ['payment', 'read'] },
  { name: 'more', label: 'Más', icon: Ellipsis },
]);

/** Modo academia (dueño, admin, staff, instructor): operación diaria. */
export default function AcademyLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="schedule" />
      <Tabs.Screen name="students" />
      <Tabs.Screen name="payments" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
