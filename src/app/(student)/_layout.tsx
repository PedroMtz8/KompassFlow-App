import { Tabs } from 'expo-router';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import Search from 'lucide-react-native/icons/search';
import User from 'lucide-react-native/icons/user';
import Wallet from 'lucide-react-native/icons/wallet';

import { makeTabBar } from '@/components/tab-bar';

const TabBar = makeTabBar([
  { name: 'my-classes', label: 'Mis clases', icon: CalendarDays },
  { name: 'discover', label: 'Descubrir', icon: Search },
  { name: 'membership', label: 'Mis pases', icon: Wallet },
  { name: 'profile', label: 'Perfil', icon: User },
]);

/** Modo alumno: descubrir, reservar y pagar. */
export default function StudentLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="my-classes" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="membership" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
