import MapPin from 'lucide-react-native/icons/map-pin';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { FormGroup, FormScreen } from '@/components/form-screen';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { useDiscoverSessions } from '@/features/bookings/queries';
import { levelLabel, type Level } from '@/features/classes/class-labels';
import { useCatalog, useMyInterests } from '@/features/interests/queries';
import { goBack } from '@/lib/nav';
import { useLocation } from '@/stores/location';

import { activeFilterCount, useDiscoverFilters, whenLabel, type When } from './filters';

const levels: Level[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

/** Filtros combinables de Descubrir: se pueden elegir varios de cada grupo y mezclar grupos. */
export function DiscoverFiltersScreen() {
  const t = useTheme();
  const f = useDiscoverFilters();
  const catalog = useCatalog();
  const interests = useMyInterests();
  const sessions = useDiscoverSessions();
  const loc = useLocation();

  const disciplines = (catalog.data ?? []).filter((v) => v.isActive).flatMap((v) => v.disciplines);
  const matching = sessions.data?.length ?? 0;
  const myIds = interests.data?.disciplineIds ?? [];

  const pickSort = async (sort: 'time' | 'near') => {
    f.setSort(sort);
    if (sort === 'near' && loc.status !== 'granted') await loc.request();
  };

  return (
    <FormScreen
      title="Filtros"
      subtitle={activeFilterCount(f) ? `${activeFilterCount(f)} activo${activeFilterCount(f) === 1 ? '' : 's'}` : 'Elige uno o varios'}
      cta={`Ver ${matching} ${matching === 1 ? 'clase' : 'clases'}`}
      onSubmit={goBack}
      secondary={{ label: 'Limpiar filtros', onPress: f.clear }}
    >
      <FormGroup label="CUÁNDO">
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(whenLabel) as When[]).map((w) => (
            <Chip key={w} label={whenLabel[w]} selected={f.when.includes(w)} onPress={() => f.toggleWhen(w)} />
          ))}
        </View>
      </FormGroup>

      <FormGroup label="DISCIPLINA">
        <View className="flex-row flex-wrap gap-2">
          {disciplines.map((d) => (
            <Chip key={d.id} label={d.name} selected={f.disciplineIds.includes(d.id)} onPress={() => f.toggleDiscipline(d.id)} />
          ))}
        </View>
        {myIds.length ? (
          <Pressable onPress={() => f.setDisciplines(myIds)} className="self-start py-1">
            <Text className="text-[12.5px] font-bold text-primary">Usar mis intereses</Text>
          </Pressable>
        ) : null}
      </FormGroup>

      <FormGroup label="NIVEL">
        <View className="flex-row flex-wrap gap-2">
          {levels.map((l) => (
            <Chip key={l} label={levelLabel[l]} selected={f.levels.includes(l)} onPress={() => f.toggleLevel(l)} />
          ))}
        </View>
      </FormGroup>

      <View className="flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-[13.5px] font-bold">Solo con lugares disponibles</Text>
          <Text className="text-[11.5px] text-muted-foreground">Oculta las clases llenas</Text>
        </View>
        <Toggle value={f.onlyAvailable} onValueChange={f.setOnlyAvailable} />
      </View>

      <FormGroup label="ORDENAR POR">
        <View className="flex-row flex-wrap gap-2">
          <Chip label="Horario" selected={f.sort === 'time'} onPress={() => pickSort('time')} />
          <Chip label="Más cercanas" selected={f.sort === 'near'} onPress={() => pickSort('near')} />
        </View>
        {f.sort === 'near' && loc.status === 'denied' ? (
          <View className="flex-row items-center gap-1.5 pt-1">
            <Icon as={MapPin} size={13} color={t.primaryDark} />
            <Text className="flex-1 text-xs text-primary-dark">Activa el permiso de ubicación en Ajustes para ordenar por cercanía.</Text>
          </View>
        ) : null}
      </FormGroup>
    </FormScreen>
  );
}
