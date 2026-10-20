import { View } from 'react-native';

import { Screen, ScreenScroll } from '@/components/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';

import { LEGAL, PRIVACY, SUPPORT, TERMS, type LegalSection } from './legal-text';

function Doc({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <Screen>
      <ScreenHeader title={title} subtitle={`Actualizado el ${LEGAL.updated}`} />
      <ScreenScroll contentContainerClassName="gap-5 pb-10">
        {sections.map((s, i) => (
          <View key={s.title} className="gap-2">
            <Text className="text-[15px] font-extrabold">
              {i + 1}. {s.title}
            </Text>
            {s.body.map((p) => (
              <Text key={p} variant="muted" className="text-[13.5px] leading-[21px]">
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScreenScroll>
    </Screen>
  );
}

export const PrivacyScreen = () => <Doc title="Aviso de privacidad" sections={PRIVACY} />;
export const TermsScreen = () => <Doc title="Términos y condiciones" sections={TERMS} />;
export const SupportScreen = () => <Doc title="Soporte" sections={SUPPORT} />;
