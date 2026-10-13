import { useState } from 'react';
import { View } from 'react-native';

import { LoadMore } from '@/components/load-more';
import { QueryStatus } from '@/components/query-status';
import { Screen, ScreenScroll } from '@/components/screen';
import { Chip } from '@/components/ui/chip';
import { ListDivider } from '@/components/ui/list-divider';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { useAdminAudit } from '@/features/admin/queries';

const LABEL: Record<string, string> = {
  'plan.updated': 'Cambió un plan',
  'plan.reset': 'Restableció un plan',
  'plan.granted': 'Otorgó un plan gratis',
  'plan.grant_revoked': 'Quitó un plan otorgado',
  'user.suspended': 'Suspendió una cuenta',
  'user.reactivated': 'Reactivó una cuenta',
  'user.deleted': 'Eliminó una cuenta',
  'user.password_activated': 'Activó su contraseña',
  'organization.verification_requested': 'Pidió verificación',
  'organization.verification_approved': 'Verificó un negocio',
  'organization.verification_rejected': 'Rechazó o suspendió un negocio',
  'organization.created': 'Creó una organización',
  'organization.updated': 'Editó una organización',
  'organization.logo_changed': 'Cambió el logo',
  'organization.logo_removed': 'Quitó el logo',
  'organization.cover_changed': 'Cambió la portada',
  'organization.cover_removed': 'Quitó la portada',
  'organization.ownership_transferred': 'Transfirió la propiedad',
  'payment.card_received': 'Pago con tarjeta recibido',
  'payment.registered': 'Registró un pago',
  'payment.refunded': 'Reembolsó un pago',
  'payment.transfer_requested': 'Pidió pagar por transferencia',
  'payment.transfer_notified': 'Avisó una transferencia',
  'payment_settings.updated': 'Cambió los datos de cobro',
  'booking.created': 'Creó una reserva',
  'booking.canceled': 'Canceló una reserva',
  'session.updated': 'Editó una sesión',
  'session.canceled': 'Canceló una sesión',
  'sessions.scheduled': 'Programó sesiones',
  'series.edited': 'Editó una serie',
  'attendance.marked': 'Marcó asistencia',
  'attendance.closed': 'Cerró la asistencia',
  'attendance.reopened': 'Reabrió la asistencia',
  'cash.closed': 'Cerró la caja',
  'connect.account_created': 'Creó su cuenta de cobros',
  'student.created': 'Agregó un alumno',
  'student.updated': 'Editó un alumno',
  'student.linked': 'Vinculó un alumno',
  'student.link_code_created': 'Generó un código de vinculación',
  'pass.member_added': 'Agregó a un pase compartido',
  'pass.member_removed': 'Quitó de un pase compartido',
  'service.created': 'Creó una clase',
  'service.updated': 'Editó una clase',
  'product.updated': 'Editó un producto',
  'location.created': 'Creó una sede',
  'location.updated': 'Editó una sede',
  'room.updated': 'Editó un salón',
  'room.deleted': 'Eliminó un salón',
  'availability.updated': 'Cambió la disponibilidad',
  'invitation.created': 'Invitó a alguien',
  'invitation.renewed': 'Renovó una invitación',
  'invitation.canceled': 'Canceló una invitación',
  'invitation.accepted': 'Aceptó una invitación',
  'invitation.rejected': 'Rechazó una invitación',
  'member.role_changed': 'Cambió el rol de un miembro',
  'member.role_from_template': 'Asignó un rol desde plantilla',
  'member.extra_permissions_set': 'Cambió permisos extra',
  'role.updated': 'Editó un rol',
  'role.deleted': 'Eliminó un rol',
  'account.created': 'Creó una cuenta administrada',
  'account.credentials_reset': 'Restableció credenciales',
};

/** Si aparece una acción nueva sin traducir, al menos se ve legible en vez de la clave técnica. */
const labelOf = (action: string) => LABEL[action] ?? action.replace(/[._]/g, ' ');

const FILTERS = [
  { label: 'Todo', prefix: '' },
  { label: 'Planes', prefix: 'plan.' },
  { label: 'Cuentas', prefix: 'user.' },
  { label: 'Verificación', prefix: 'organization.verification' },
];

const when = (d: Date | string) =>
  new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

/** Bitácora: quién hizo qué, en toda la plataforma. */
export function AdminAuditScreen() {
  const [prefix, setPrefix] = useState('');
  const q = useAdminAudit(prefix);
  const rows = q.data ?? [];
  return (
    <Screen>
      <ScreenHeader title="Bitácora" subtitle="Acciones en la plataforma" />
      <ScreenScroll contentContainerClassName="gap-3 pb-8" onRefresh={() => q.refetch()}>
        <View className="flex-row flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Chip key={f.label} label={f.label} selected={prefix === f.prefix} onPress={() => setPrefix(f.prefix)} />
          ))}
        </View>
        <QueryStatus q={q} />
        {q.data && rows.length === 0 ? <Text variant="muted">Sin movimientos.</Text> : null}
        <View>
          {rows.map((a, i) => (
            <View key={a.id}>
              <View className="gap-0.5 py-2.5">
                <Text className="text-[13.5px] font-bold">{labelOf(a.action)}</Text>
                <Text className="text-[11.5px] text-muted-foreground" numberOfLines={2}>
                  {a.actorName ?? 'Sistema'}
                  {a.targetName ? ` → ${a.targetName}` : ''}
                  {a.orgName ? ` · ${a.orgName}` : ''} · {when(a.at)}
                </Text>
              </View>
              {i < rows.length - 1 ? <ListDivider /> : null}
            </View>
          ))}
        </View>
        <LoadMore q={q} label="Ver más" />
      </ScreenScroll>
    </Screen>
  );
}
