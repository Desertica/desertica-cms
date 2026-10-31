/** What a tour still lacks before it is worth publishing. Shared by the server (home widget) and the editor panel. */
export const GAP_LABELS = {
  photo: 'Foto principal',
  description: 'Descripción',
  meeting: 'Punto de encuentro',
  waiver: 'Descargo de responsabilidad',
  faqs: 'Preguntas frecuentes',
} as const;

export type Gap = keyof typeof GAP_LABELS;

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
const has = (value: any) => (Array.isArray(value) ? value.length > 0 : value != null && value !== '');

export function tourGaps(tour: Record<string, any>): Gap[] {
  const gaps: Gap[] = [];
  if (!has(tour.image) && blank(tour.imageUrl)) gaps.push('photo');
  if (blank(tour.description)) gaps.push('description');
  if (blank(tour.meeting) && blank(tour.meetingPointUrl)) gaps.push('meeting');
  if (blank(tour.waiverBody)) gaps.push('waiver');
  if (!has(tour.faqs)) gaps.push('faqs');
  return gaps;
}
