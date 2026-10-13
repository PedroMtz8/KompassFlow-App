import { useEffect } from 'react';
import { View } from 'react-native';

import { QueryStatus } from '@/components/query-status';
import { FormGroup } from '@/components/form-screen';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';

import { useZones } from './queries';

export type LocationValue = {
  address: string;
  /** Colonia del catálogo; si es null se usan `neighborhood` y `city` escritos a mano. */
  zoneId: string | null;
  neighborhood: string;
  city: string;
  /** Enlace de Google Maps (opcional). */
  mapsUrl: string;
};

export const emptyLocation: LocationValue = { address: '', zoneId: null, neighborhood: '', city: '', mapsUrl: '' };

/** ¿Hay lo mínimo para guardar la sede? */
export const isLocationValid = (v: LocationValue) => v.address.trim().length >= 3 && (!!v.zoneId || v.city.trim().length >= 2);

/** Cuerpo para la API: con colonia del catálogo, la ciudad y las coordenadas salen del servidor. */
export const toLocationBody = (v: LocationValue) => ({
  ...(v.zoneId
    ? { address: v.address, zoneId: v.zoneId }
    : { address: v.address, neighborhood: v.neighborhood || undefined, city: v.city }),
  // Cadena vacía = quitar el enlace al editar.
  mapsUrl: v.mapsUrl.trim(),
});

/**
 * Dirección + colonia. Primero se elige la ciudad y su colonia del catálogo (de ahí salen coordenadas
 * y zona horaria); si no está, "Otra" permite escribirlas.
 */
export function LocationFields({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
  const zones = useZones();
  const cities = zones.data ?? [];
  const current = cities.find((c) => c.neighborhoods.some((n) => n.id === value.zoneId)) ?? cities[0];
  const custom = !value.zoneId;

  // Con una sola ciudad disponible se arranca ya en ella (sin pedir nada).
  useEffect(() => {
    if (!value.city && current && custom) onChange({ ...value, city: current.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  return (
    <>
      <Field
        label="Dirección"
        value={value.address}
        onChangeText={(address) => onChange({ ...value, address })}
        placeholder="Calle y número"
        maxLength={160}
      />
      <QueryStatus q={zones} />
      {cities.length > 1 ? (
        <FormGroup label="Ciudad">
          <View className="flex-row flex-wrap gap-2">
            {cities.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={current?.id === c.id}
                onPress={() => onChange({ ...value, zoneId: null, city: c.name, neighborhood: '' })}
              />
            ))}
          </View>
        </FormGroup>
      ) : null}
      {current ? (
        <FormGroup label={`Colonia · ${current.name}, ${current.state ?? ''}`.replace(/, $/, '')}>
          <View className="flex-row flex-wrap gap-2">
            {current.neighborhoods.map((n) => (
              <Chip
                key={n.id}
                label={n.name}
                selected={value.zoneId === n.id}
                onPress={() => onChange({ ...value, zoneId: n.id, neighborhood: n.name, city: current.name })}
              />
            ))}
            <Chip label="Otra" selected={custom} onPress={() => onChange({ ...value, zoneId: null, city: value.city || current.name })} />
          </View>
        </FormGroup>
      ) : null}
      {custom ? (
        <View className="flex-row gap-2.5">
          <Field
            label="Colonia"
            value={value.neighborhood}
            onChangeText={(neighborhood) => onChange({ ...value, neighborhood })}
            containerClassName="flex-1"
            maxLength={80}
          />
          <Field
            label="Ciudad"
            value={value.city}
            onChangeText={(city) => onChange({ ...value, city })}
            containerClassName="flex-1"
            maxLength={80}
          />
        </View>
      ) : (
        <Text variant="muted" className="text-xs">
          Ubicamos tu sede en {value.neighborhood} para mostrarte en el mapa y en “cerca de mí”.
        </Text>
      )}
      <View className="gap-1.5">
        <Field
          label="Enlace de Google Maps (opcional)"
          value={value.mapsUrl}
          onChangeText={(mapsUrl) => onChange({ ...value, mapsUrl })}
          placeholder="https://maps.app.goo.gl/…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={500}
        />
        <Text variant="muted" className="text-xs">
          En Google Maps busca tu negocio → Compartir → Copiar enlace. Así tus alumnos llegan a la puerta exacta.
        </Text>
      </View>
    </>
  );
}
