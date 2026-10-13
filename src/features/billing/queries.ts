import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { getBaseUrl } from '@/lib/base-url';
import { openExternal } from '@/lib/open-url';

export const billingKey = (orgId: string) => ['orgs', orgId, 'billing'] as const;

/** Plan vigente de la organización, límites, uso y planes disponibles. */
export function useBilling(orgId: string | null | undefined) {
  return useQuery({
    queryKey: billingKey(orgId ?? ''),
    enabled: !!orgId,
    // Con un pago de plan sin aplicar se revisa cada pocos segundos hasta que Stripe confirme (sin esperar el aviso).
    refetchInterval: (q) => (q.state.data?.pendingCheckout ? 6000 : false),
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).billing.get();
      if (error) throw new Error('No se pudo cargar el plan');
      return data;
    },
  });
}

export type Billing = NonNullable<ReturnType<typeof useBilling>['data']>;

const back = () => `${getBaseUrl()}/plan`;

const open = openExternal;

export function useBillingActions(orgId: string) {
  const qc = useQueryClient();
  return {
    /** Contratar o cambiar de plan (checkout de Stripe). Solo el propietario. */
    subscribe: useMutation({
      mutationFn: async (plan: string) => {
        const { data, error } = await authClient.subscription.upgrade({
          plan,
          referenceId: orgId,
          customerType: 'organization',
          successUrl: back(),
          cancelUrl: back(),
          returnUrl: back(),
          disableRedirect: true,
        });
        if (error || !data?.url) throw new Error(error?.message ?? 'No se pudo abrir el pago');
        await open(data.url);
      },
      onSettled: () => qc.invalidateQueries({ queryKey: billingKey(orgId) }),
    }),
    /** Portal de Stripe: método de pago, facturas y cancelación. */
    portal: useMutation({
      mutationFn: async () => {
        const { data, error } = await authClient.subscription.billingPortal({
          referenceId: orgId,
          customerType: 'organization',
          returnUrl: back(),
          disableRedirect: true,
        });
        if (error || !data?.url) throw new Error(error?.message ?? 'No se pudo abrir la facturación');
        await open(data.url);
      },
    }),
  };
}
