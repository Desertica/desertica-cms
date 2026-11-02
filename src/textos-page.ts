import { PAGE_ES, PAGE_ORDER } from './sort-key.ts';

export type TextRow = { documentId: string; key: string; page: string; section: string; label?: string | null; note?: string | null; kind?: string | null; value?: string | null };

/** Technical or developer-only sections the Editor must not see (they are not website copy, or must never change per language). */
export const HIDDEN_SECTIONS = new Set(['global/placeholders', 'global/language']);

const SECTION_ES: Record<string, string> = {
  'skip-link': 'Enlace "saltar al contenido"', aria: 'Etiquetas para lectores de pantalla', header: 'Menú superior', labels: 'Etiquetas de accesibilidad', whatsapp: 'Botón de WhatsApp',
  'mobile-menu': 'Menú del celular', hero: 'Portada (cabecera)', cta: 'Llamada a la acción', card: 'Tarjeta de tour', form: 'Formulario', reply: 'Mensaje de respuesta', errors: 'Mensajes de error',
  columns: 'Columnas', newsletter: 'Boletín', legal: 'Enlaces legales', stamps: 'Sellos', social: 'Redes sociales', why: 'Por qué Desértica', featured: 'Tours destacados', pitch: 'Propuesta',
  manifesto: 'Manifiesto', map: 'Mapa', trio: 'Trío de fotos', motivation: 'Motivación', craft: 'Oficio', archive: 'Archivo', closer: 'Cierre', details: 'Detalles del tour', videos: 'Videos',
  'booking-form': 'Formulario de reserva', breadcrumb: 'Ruta de navegación', gallery: 'Galería', itinerary: 'Itinerario', assurances: 'Garantías', seo: 'Título y descripción en Google', list: 'Listado',
  cookies: 'Aviso de cookies', flow: 'Pasos de la reserva', checkout: 'Pago', payment: 'Resultado del pago', 'my-booking': 'Mi reserva', complaints: 'Libro de reclamaciones', waiver: 'Descargo de responsabilidad',
  'not-found': 'Página no encontrada', lead: 'Introducciones',
};

export const sectionTitle = (section: string) => SECTION_ES[section] ?? section.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const pageTitle = (page: string) => PAGE_ES[page] ?? page;

/** The stored label is "Página › sección › nombre"; inside the page only the last part is useful. */
export const rowName = (r: Pick<TextRow, 'label' | 'key'>) => {
  const last = (r.label ?? '').split(' › ').pop() || r.key;
  return last.charAt(0).toUpperCase() + last.slice(1);
};

export const isLong = (r: TextRow) => r.kind === 'long' || (r.value ?? '').length > 70 || /\n/.test(r.value ?? '');

/** `n`: the section's place in its page; `start`: rows before it in the page. Both ignore the search, so "imagen 7" stays 7. */
export type Section<T = TextRow> = { id: string; title: string; n: number; start: number; rows: T[] };
export type PageGroup<T = TextRow> = { page: string; title: string; count: number; sections: Section<T>[] };

const rank = (page: string) => (PAGE_ORDER.includes(page) ? PAGE_ORDER.indexOf(page) : PAGE_ORDER.length);

/** Visible rows (texts or image slots) grouped by page (website order) and section; `query` keeps rows whose value, name or description contains it. */
export function groupTexts<T extends Pick<TextRow, 'page' | 'section' | 'key' | 'label' | 'value'> & { description?: string | null }>(rows: T[], query = ''): PageGroup<T>[] {
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !HIDDEN_SECTIONS.has(`${r.page}/${r.section}`));
  const pages = [...new Set(shown.map((r) => r.page))].sort((a, b) => rank(a) - rank(b));
  return pages.flatMap((page) => {
    const mine = shown.filter((r) => r.page === page);
    let start = 0;
    const sections = [...new Set(mine.map((r) => r.section))].map((section, i) => {
      // numeric: the list is sorted as text (archive.10 before archive.2); "Imagen 2" must be photo 2
      const all = mine.filter((r) => r.section === section).sort((a, b) => a.key.localeCompare(b.key, 'es', { numeric: true }));
      const part = { id: `${page}/${section}`, title: sectionTitle(section), n: i + 1, start, rows: all.filter((r) => !q || `${r.value ?? ''} ${rowName(r)} ${r.description ?? ''}`.toLowerCase().includes(q)) };
      start += all.length;
      return part;
    }).filter((s) => s.rows.length);
    return sections.length ? [{ page, title: pageTitle(page), count: sections.reduce((n, s) => n + s.rows.length, 0), sections }] : [];
  });
}

const GENERIC = 'JPG o WebP, máximo 500 KB. Se recorta para llenar el espacio: deja lo importante al centro.';
const HERO = 'Horizontal, unos 2400 × 1500 px, máximo 600 KB. Se recorta para llenar la pantalla: deja lo importante al centro, un poco arriba.';
/** Where each image appears on the website and the format it likes (the site crops with object-fit: cover). */
export const IMAGE_HELP: Record<string, string> = {
  'home.hero': `Foto grande de portada de Inicio, lo primero que se ve. ${HERO}`,
  'blog.hero': `Foto grande de portada del Blog. ${HERO}`,
  'products.hero': `Foto grande de portada de la Tienda. ${HERO}`,
  'tours.banner': `Foto grande de portada de la lista de Tours. ${HERO}`,
  'tours.closer': 'Foto ancha del final de la lista de Tours y de Nosotros, junto al botón para reservar. Horizontal y alargada, unos 2400 × 800 px, máximo 500 KB.',
  'contact.band': 'Franja ancha de la página de Contacto. Horizontal, unos 1600 × 900 px, máximo 400 KB.',
  'about.trio': 'Foto de los tres fundadores en Nosotros. Horizontal, unos 2400 × 1400 px, máximo 600 KB; que se vean las caras, no queden en los bordes.',
  'about.video': 'Video de arena en Nosotros: la imagen que se ve antes de que cargue el video. Horizontal, unos 1600 × 900 px, máximo 300 KB. El video se cambia en la ficha.',
  'footer.stamp.mincetur': 'Sello de MINCETUR en el pie de página. PNG con fondo transparente, unos 300 px de ancho, máximo 50 KB.',
  'footer.stamp.complaints': 'Sello del Libro de Reclamaciones en el pie de página. PNG con fondo transparente, unos 300 px de ancho, máximo 50 KB.',
};
const ARCHIVE = /^about\.archive\.(\d+)$/;

export function imageHelp(key: string, page: string, section: string) {
  const n = ARCHIVE.exec(key)?.[1];
  if (n) return `Foto ${n} de 12 de la galería de archivo de Nosotros. Vertical (2:3), unos 900 × 1400 px, máximo 300 KB.`;
  return IMAGE_HELP[key] ?? `Aparece en ${pageTitle(page)}, sección "${sectionTitle(section)}". ${GENERIC}`;
}

export const textHelp = (page: string, section: string) => `Aparece en ${pageTitle(page)}, sección "${sectionTitle(section)}".`;
