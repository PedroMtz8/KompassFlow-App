import { Redirect, Stack } from 'expo-router';

import { authClient } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

/** Los flujos (reservar, pagar, administrar) exigen sesión. */
export default function FlowsLayout() {
  const { data: session, isPending } = authClient.useSession();
  const t = useTheme();
  if (isPending) return null;
  if (!session) return <Redirect href="/sign-in" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.background } }} />;
}
