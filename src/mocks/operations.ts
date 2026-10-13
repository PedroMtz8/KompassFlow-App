import type { Tone } from '@/lib/tones';
import { avatar } from '@/mocks/photos';

export const today = {
  weekday: 'MARTES 19 · STAFF',
  stats: [
    { value: '48', label: 'reservas' },
    { value: '82%', label: 'ocupación' },
    { value: '$1,440', label: 'por cobrar' },
  ],
  sessions: [
    { id: 's1', time: '18:00', title: 'Salsa on1 Básico', meta: 'Prof. Ceci · Salón B', booked: 14, capacity: 16, tone: 'amber' as Tone },
    {
      id: 's2',
      time: '19:00',
      title: 'Bachata Intermedio',
      meta: 'Prof. Nico · Salón A',
      booked: 16,
      capacity: 20,
      tone: 'orange' as Tone,
    },
    { id: 's3', time: '20:00', title: 'Salsa on2 Básico', meta: 'Prof. Ceci · Salón B', booked: 16, capacity: 16, tone: 'pink' as Tone },
  ],
  pendingTransfers: 3,
};

export const myClasses = {
  next: { title: 'Bachata Intermedio', when: 'Mar 19 · 19:00 · Ritmo · Salón A', code: 'RTM-4821', in: 'EN 2 DÍAS' },
  stats: { attended: '36', academies: '3' },
  history: [
    { id: 'h1', title: 'Bachata Intermedio', meta: '14 mar · Ritmo · Paquete', tone: 'orange' as Tone, status: 'ASISTIÓ' },
    { id: 'h2', title: 'Kizomba Fundamentos', meta: '12 mar · Kizomba Lab · Tarjeta', tone: 'violet' as Tone, status: 'ASISTIÓ' },
    { id: 'h3', title: 'Tango Práctica', meta: '09 mar · Casa Tango · Efectivo', tone: 'teal' as Tone, status: 'CANCELADA' },
  ],
};

export const students = [
  { id: 'a1', name: 'Mara Castillo', avatar: avatar(32), note: 'Paquete 12 · 7 créditos', badge: 'PAQUETE', tone: 'violet' as Tone },
  { id: 'a2', name: 'Valeria Ortiz', avatar: avatar(47), note: 'Paquete 12 · 3 créditos', badge: 'PAQUETE', tone: 'violet' as Tone },
  { id: 'a3', name: 'Diego Ramírez', initials: 'DR', note: 'Sin cuenta · 9 asistencias', badge: 'PENDIENTE', tone: 'amber' as Tone },
  { id: 'a4', name: 'Andrés Molina', avatar: avatar(15), note: 'Clase suelta · al día', badge: 'PAGADO', tone: 'teal' as Tone },
  { id: 'a5', name: 'Sofía Treviño', avatar: avatar(44), note: 'Mensualidad · renueva 1 abr', badge: 'PAGADO', tone: 'teal' as Tone },
];

export const weekDays = [
  { id: 'w1', dow: 'LUN', day: '18' },
  { id: 'w2', dow: 'MAR', day: '19' },
  { id: 'w3', dow: 'MIÉ', day: '20' },
  { id: 'w4', dow: 'JUE', day: '21' },
  { id: 'w5', dow: 'VIE', day: '22' },
];

export const cancelReasons = ['Me surgió un imprevisto', 'Cambié de horario', 'Me siento mal', 'Otro motivo'];

export const filterOptions = {
  disciplines: ['Bachata', 'Salsa', 'Kizomba', 'Tango', 'Cumbia', 'Hip hop'],
  levels: ['Principiante', 'Básico', 'Intermedio', 'Avanzado'],
  days: ['Hoy', 'Mañana', 'Este fin de semana'],
  distances: ['1 km', '3 km', '5 km', '10 km'],
};

export const studentDetail = {
  name: 'Diego Ramírez',
  initials: 'DR',
  since: 'desde 2 mar',
  phone: '+52 55 4102 8831',
  stats: [
    { value: '9', label: 'asistencias' },
    { value: '3', label: 'pagos' },
    { value: '1', label: 'paquete' },
  ],
  product: 'Paquete 12 clases · 7 créditos',
  attendance: [
    { id: 'a1', title: 'Bachata Intermedio', meta: '14 mar · Ritmo', status: 'ASISTIÓ' },
    { id: 'a2', title: 'Salsa on1 Básico', meta: '12 mar · Ritmo', status: 'ASISTIÓ' },
    { id: 'a3', title: 'Salsa on1 Básico', meta: '07 mar · Ritmo', status: 'FALTA' },
  ],
  payments: [
    { id: 'p1', title: 'Paquete 12 clases', meta: '2 mar · Efectivo', amount: 1650 },
    { id: 'p2', title: 'Clase suelta', meta: '26 feb · Efectivo', amount: 180 },
  ],
};

export const cashSummary = {
  total: 2340,
  lines: [
    { label: 'Clases sueltas (6)', amount: 1080 },
    { label: 'Paquete 12 clases (1)', amount: 1650 },
    { label: 'Reembolsos', amount: -390 },
  ],
  counted: '2,340',
};
