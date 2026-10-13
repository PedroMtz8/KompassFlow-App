import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { stripeReturnLink } from '@/lib/app-link';
import { openExternal } from '@/lib/open-url';

const fail = (error: { value?: unknown } | null | undefined, fallback: string): never => {
  throw new Error((error?.value as { message?: string } | undefined)?.message ?? fallback);
};

export const productsKey = (orgId: string) => ['orgs', orgId, 'products'] as const;
export const settingsKey = (orgId: string) => ['orgs', orgId, 'payment-settings'] as const;
export const paymentsKey = (orgId: string) => ['orgs', orgId, 'payments'] as const;
export const cashKey = (orgId: string) => ['orgs', orgId, 'cash'] as const;
export const membershipKey = ['me', 'membership'] as const;

/* ── Lado organización ───────────────────────────────────────────────────── */

export function useProducts(orgId: string | null | undefined) {
  return useQuery({
    queryKey: productsKey(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).products.get();
      if (error) throw new Error('No se pudieron cargar los productos');
      return data;
    },
  });
}

export type ProductItem = NonNullable<ReturnType<typeof useProducts>['data']>[number];

export type ProductBody = {
  name: string;
  description?: string;
  kind: 'SINGLE' | 'PACKAGE' | 'MEMBERSHIP';
  priceCents: number;
  credits?: number;
  validityDays?: number;
  seats?: number;
  isVisible?: boolean;
};

export function useProductMutations(orgId: string) {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: productsKey(orgId) }), qc.invalidateQueries({ queryKey: ['discover'] })]);
  return {
    create: useMutation({
      mutationFn: async (v: ProductBody) => {
        const { error } = await api.orgs({ id: orgId }).products.post(v);
        if (error) fail(error, 'No se pudo crear el producto');
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async (v: { productId: string } & Partial<ProductBody> & { isActive?: boolean }) => {
        const { productId, ...body } = v;
        const { error } = await api.orgs({ id: orgId }).products({ productId }).patch(body);
        if (error) fail(error, 'No se pudo guardar el producto');
      },
      onSuccess: refresh,
    }),
  };
}

export function usePaymentSettings(orgId: string | null | undefined) {
  return useQuery({
    queryKey: settingsKey(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! })['payment-settings'].get();
      if (error) throw new Error('No se pudieron cargar los datos de cobro');
      return data;
    },
  });
}

export function useSavePaymentSettings(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { acceptsCash: boolean; acceptsTransfer: boolean; bank?: string; clabe?: string; beneficiary?: string }) => {
      const { error } = await api.orgs({ id: orgId })['payment-settings'].put(v);
      if (error) fail(error, 'No se pudieron guardar los datos de cobro');
    },
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: settingsKey(orgId) }), qc.invalidateQueries({ queryKey: ['discover'] })]),
  });
}

/** Resumen del mes (`YYYY-MM`; sin valor, el mes actual en la zona de la academia). */
export function usePaymentsSummary(orgId: string | null | undefined, month?: string) {
  return useQuery({
    queryKey: [...paymentsKey(orgId ?? ''), 'summary', month ?? 'current'],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).payments.summary.get({ query: { month } });
      if (error) throw new Error('No se pudieron cargar los pagos');
      return data;
    },
  });
}

const PAYMENTS_PAGE = 25;

/** Lista de pagos por páginas. Con `q` busca en todo el historial (alumno, clase/paquete o referencia); sin `q`, solo el mes. */
export function usePaymentsList(orgId: string | null | undefined, opts: { q?: string; month?: string }) {
  return useInfiniteQuery({
    queryKey: [...paymentsKey(orgId ?? ''), 'list', opts.q ?? '', opts.q ? '' : (opts.month ?? 'current')],
    enabled: !!orgId && (!!opts.q || !!opts.month),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api
        .orgs({ id: orgId! })
        .payments.get({ query: { q: opts.q || undefined, month: opts.q ? undefined : opts.month, limit: PAYMENTS_PAGE, offset: pageParam } });
      if (error) throw new Error('No se pudieron cargar los pagos');
      return data;
    },
    getNextPageParam: (last, all) => (last.length === PAYMENTS_PAGE ? all.length * PAYMENTS_PAGE : undefined),
    select: (d) => d.pages.flat(),
  });
}

const HISTORY_PAGE = 25;

/** Historial de pagos de la persona en todas sus academias (o en una), por páginas. */
export function useMyPaymentHistory(organizationId?: string) {
  return useInfiniteQuery({
    queryKey: [...membershipKey, 'history', organizationId ?? 'all'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.me['payment-history'].get({ query: { organizationId, limit: HISTORY_PAGE, offset: pageParam } });
      if (error) throw new Error('No se pudo cargar tu historial de pagos');
      return data;
    },
    getNextPageParam: (last, all) => (last.length === HISTORY_PAGE ? all.length * HISTORY_PAGE : undefined),
    select: (d) => d.pages.flat(),
  });
}

export type PaymentsSummary = NonNullable<ReturnType<typeof usePaymentsSummary>['data']>;

export function useRegisterPayment(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      studentId: string;
      productId?: string;
      concept?: string;
      amountCents?: number;
      method: 'CASH' | 'TRANSFER' | 'OTHER';
      reference?: string;
      note?: string;
      memberStudentIds?: string[];
    }) => {
      const { error } = await api.orgs({ id: orgId }).payments.post(v);
      if (error) fail(error, 'No se pudo registrar el pago');
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: paymentsKey(orgId) }),
        qc.invalidateQueries({ queryKey: cashKey(orgId) }),
        qc.invalidateQueries({ queryKey: ['orgs', orgId, 'students'] }),
        qc.invalidateQueries({ queryKey: productsKey(orgId) }),
      ]),
  });
}

export function useResolveTransfer(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { paymentId: string; decision: 'confirm' | 'reject' }) => {
      const call = api.orgs({ id: orgId }).payments({ paymentId: v.paymentId });
      const { error } = v.decision === 'confirm' ? await call.confirm.post() : await call.reject.post();
      if (error) fail(error, 'No se pudo resolver el pago');
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: paymentsKey(orgId) }),
        qc.invalidateQueries({ queryKey: productsKey(orgId) }),
        qc.invalidateQueries({ queryKey: membershipKey }),
      ]),
  });
}

export function useCash(orgId: string | null | undefined) {
  return useQuery({
    queryKey: cashKey(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).cash.get();
      if (error) throw new Error('No se pudo cargar la caja');
      return data;
    },
  });
}

export function useCloseCash(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { countedCents: number; note?: string }) => {
      const { data, error } = await api.orgs({ id: orgId }).cash.close.post(v);
      if (error || !data) fail(error, 'No se pudo cerrar la caja');
      return data as { differenceCents: number };
    },
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: cashKey(orgId) }), qc.invalidateQueries({ queryKey: paymentsKey(orgId) })]),
  });
}

/* ── Lado persona ────────────────────────────────────────────────────────── */

/** Productos que vende una academia publicada y cómo se puede pagar. */
export function usePublicProducts(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['discover', 'products', orgId ?? ''],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.discover.orgs({ id: orgId! }).products.get();
      if (error) throw new Error('No se pudieron cargar los paquetes');
      return data;
    },
  });
}

export function useRequestTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await api.discover.products({ id: productId }).transfer.post();
      if (error || !data) fail(error, 'No se pudo generar la referencia');
      return data as {
        id: string;
        reference: string;
        amountCents: number;
        concept: string;
        currency: string;
        bank: string;
        clabe: string;
        beneficiary: string;
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: membershipKey }),
  });
}

export function useMyTransfer(paymentId: string | undefined) {
  return useQuery({
    queryKey: ['me', 'payment', paymentId ?? ''],
    enabled: !!paymentId,
    queryFn: async () => {
      const { data, error } = await api.me.payments({ id: paymentId! }).get();
      if (error) throw new Error('No se pudo cargar el pago');
      return data;
    },
  });
}

export function useNotifyTransfer(paymentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trackingKey: string) => {
      const { error } = await api.me.payments({ id: paymentId }).notify.post({ trackingKey });
      if (error) fail(error, 'No se pudo enviar el aviso');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'payment', paymentId] }),
  });
}

/** Mis pases (créditos y membresías) y mis pagos en todas mis academias. */
export function useMyMembership() {
  return useQuery({
    queryKey: membershipKey,
    queryFn: async () => {
      const { data, error } = await api.me.membership.get();
      if (error) throw new Error('No se pudo cargar tu membresía');
      return data;
    },
  });
}

/* ── Cobros con tarjeta (Stripe Connect) ─────────────────────────────────── */

export const connectKey = (orgId: string) => ['orgs', orgId, 'connect'] as const;

/** Estado de la cuenta de cobro con tarjeta de la academia (se sincroniza con Stripe al consultarlo). */
export function useConnect(orgId: string | null | undefined) {
  return useQuery({
    queryKey: connectKey(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await api.orgs({ id: orgId! }).connect.get();
      if (error) throw new Error('No se pudo cargar el cobro con tarjeta');
      return data;
    },
  });
}

export function useConnectActions(orgId: string) {
  return {
    /** Abre el alta (o su continuación) de la cuenta de cobros en Stripe. Regresa a Precios. */
    onboard: useMutation({
      mutationFn: async () => {
        const back = stripeReturnLink('/pricing');
        const { data, error } = await api.orgs({ id: orgId }).connect.onboard.post({ returnUrl: back, refreshUrl: back });
        if (error || !data || !('url' in data)) fail(error, 'No se pudo abrir Stripe');
        await openExternal((data as { url: string }).url);
      },
    }),
    /** Panel de Stripe de la academia: pagos recibidos, depósitos y datos bancarios. */
    dashboard: useMutation({
      mutationFn: async () => {
        const { data, error } = await api.orgs({ id: orgId }).connect.dashboard.post();
        if (error || !data || !('url' in data)) fail(error, 'No se pudo abrir el panel');
        await openExternal((data as { url: string }).url);
      },
    }),
  };
}

/** Reembolsa un pago con tarjeta (devuelve el dinero y vence el pase que dio). */
export function useRefundPayment(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await api.orgs({ id: orgId }).payments({ paymentId }).refund.post();
      if (error) fail(error, 'No se pudo reembolsar');
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: paymentsKey(orgId) }),
        qc.invalidateQueries({ queryKey: ['orgs', orgId, 'students'] }),
        qc.invalidateQueries({ queryKey: membershipKey }),
      ]),
  });
}

/** Alumno: abre el Checkout de Stripe para pagar un producto con tarjeta. */
export function useCardCheckout() {
  return useMutation({
    mutationFn: async (productId: string) => {
      // `{CHECKOUT_SESSION_ID}` lo sustituye Stripe: así al volver sabemos qué pago confirmar.
      const { data, error } = await api.discover.products({ id: productId })['card-checkout'].post({
        successUrl: stripeReturnLink('/payment-result', true),
        cancelUrl: stripeReturnLink('/membership'),
      });
      if (error || !data) fail(error, 'No se pudo abrir el pago con tarjeta');
      await openExternal((data as { url: string }).url);
    },
  });
}

/** Al volver de Stripe: confirma el pago (el webhook hace lo mismo; el primero que llegue lo registra). */
export function useConfirmCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { sessionId: string; accountId: string }) => {
      const { data, error } = await api.me.checkout.confirm.post(v);
      if (error || !data) fail(error, 'No pudimos confirmar tu pago todavía.');
      return data as { status: 'paid' | 'already' | 'unpaid' | 'ignored'; concept: string | null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: membershipKey }),
  });
}
