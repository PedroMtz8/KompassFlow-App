import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type MoneyCardProps = {
  label: string;
  amount: string;
  caption?: string;
  className?: string;
  children?: React.ReactNode;
};

/** Tarjeta oscura para dinero: totales, saldo, comprobantes. */
export function MoneyCard({ label, amount, caption, className, children }: MoneyCardProps) {
  return (
    <View className={cn('gap-1 rounded-[26px] bg-ink p-[18px]', className)}>
      <Text className="text-[11.5px] text-[#B9B2C0]">{label}</Text>
      <Text className="font-mono-bold text-[34px] leading-[34px] tracking-[-0.04em] text-white">{amount}</Text>
      {caption ? <Text className="text-[12.5px] font-semibold text-white/70">{caption}</Text> : null}
      {children}
    </View>
  );
}
