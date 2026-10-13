/** Fotos de ejemplo (Unsplash / pravatar) usadas mientras las pantallas trabajan con datos mock. */
const u = (id: string, w = 700) => `https://images.unsplash.com/${id}?w=${w}&q=60&auto=format&fit=crop`;

export const photos = {
  hero: u('photo-1568121980155-32fb5e8f101c', 900),
  ritmo: u('photo-1504609813442-a8924e83f76e', 240),
  kizomba: u('photo-1712192682756-ae5b3a8e7508', 240),
  tango: u('photo-1545959570-a94084071b5d', 240),
  studio: u('photo-1736660604938-a357b80f8775'),
  personal: u('photo-1545959570-a94084071b5d'),
  bachata: u('photo-1568121980155-32fb5e8f101c', 240),
};

export const avatar = (n: number) => `https://i.pravatar.cc/120?img=${n}`;
