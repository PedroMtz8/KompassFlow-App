import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useActiveOrganization } from '@/features/organizations/queries';
import { can } from '@/features/organizations/permissions';
import { useIsDesktop } from '@/lib/use-layout';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** Icono y etiqueta por ruta; se pasa desde el layout de cada modo (alumno / academia). */
export type TabItem = {
  name: string;
  label: string;
  icon: LucideIcon;
  /** [recurso, acción]: la pestaña solo se muestra a quien tiene ese permiso en la academia activa. */
  perm?: [string, string];
};

/** Barra inferior de KompassFlow: fondo blanco, pastilla naranja suave en la pestaña activa. */
export function makeTabBar(items: TabItem[]) {
  return function TabBar({ state, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const desktop = useIsDesktop();
    const t = useTheme();
    const { org } = useActiveOrganization();
    // En escritorio la navegación vive en la barra lateral.
    if (desktop) return null;
    return (
      <View className="border-t border-ink/[0.07] bg-card" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="mx-auto w-full max-w-[480px] md:max-w-[680px] flex-row justify-between px-6 pt-3">
          {state.routes.map((route, index) => {
            const item = items.find((i) => i.name === route.name);
            if (!item || (item.perm && !can(org, item.perm[0], item.perm[1]))) return null;
            const focused = state.index === index;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
                className="items-center gap-1"
              >
                <View className={cn('h-[30px] w-11 items-center justify-center rounded-xl', focused && 'bg-primary-soft')}>
                  <Icon as={item.icon} size={20} color={focused ? t.primary : t.subtle} strokeWidth={focused ? 2.2 : 1.9} />
                </View>
                <Text className={cn('text-[10px] font-bold', focused ? 'text-primary' : 'text-subtle')}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };
}
