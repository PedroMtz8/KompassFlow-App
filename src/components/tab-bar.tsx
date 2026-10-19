import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
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

/** Barra inferior de KompassFlow: cápsula flotante blanca con sombra; la pestaña activa lleva una pastilla con degradado. */
export function makeTabBar(items: TabItem[]) {
  return function TabBar({ state, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const desktop = useIsDesktop();
    const t = useTheme();
    const { org } = useActiveOrganization();
    // En escritorio la navegación vive en la barra lateral.
    if (desktop) return null;
    return (
      <View className="px-3.5 pt-1.5" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
        <View className="mx-auto w-full max-w-[480px] flex-row justify-between rounded-[28px] border border-ink/[0.05] bg-card px-3 pb-2 pt-2 shadow-[0_2px_4px_rgba(16,32,26,0.04),0_18px_40px_-10px_rgba(16,32,26,0.22)] md:max-w-[680px]">
          {state.routes.map((route, index) => {
            const item = items.find((i) => i.name === route.name);
            if (!item || (item.perm && !can(org, item.perm[0], item.perm[1]))) return null;
            const focused = state.index === index;
            return (
              <PressScale
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: focused }}
                scale={0.9}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
                className="min-w-[52px] flex-1 items-center gap-[3px]"
              >
                <View className="h-8 w-12 items-center justify-center overflow-hidden rounded-[14px]">
                  {focused ? (
                    <LinearGradient
                      colors={[t.primaryLight, t.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    />
                  ) : null}
                  <View>
                    <Icon as={item.icon} size={19} color={focused ? '#fff' : t.subtle} strokeWidth={focused ? 2.3 : 1.9} />
                  </View>
                </View>
                <Text className={cn('text-[10px] font-bold', focused ? 'text-primary' : 'text-subtle')}>{item.label}</Text>
              </PressScale>
            );
          })}
        </View>
      </View>
    );
  };
}
