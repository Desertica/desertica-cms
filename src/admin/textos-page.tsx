import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Field, Flex, Loader, Textarea, TextInput, Typography } from '@strapi/design-system';
import { Layouts, useFetchClient } from '@strapi/strapi/admin';
import { NavLink } from 'react-router-dom';
import { groupTexts, imageHelp, textHelp, type PageGroup, isLong, rowName, type TextRow } from '../textos-page';

const UID = 'api::translation.translation';
const BASE = `/content-manager/collection-types/${UID}`;
const MEDIA = 'api::media-slot.media-slot';
type Slot = TextRow & { description?: string | null; imageUrl?: string | null; posterUrl?: string | null; videoUrl?: string | null; image?: { url: string } | null; poster?: { url: string } | null; video?: unknown };
type Status = 'saving' | 'saved' | 'error';
const STATUS_TEXT: Record<Status, string> = { saving: 'Guardando…', saved: 'Guardado', error: 'No se pudo guardar. Inténtalo otra vez.' };

/** Same endpoints and permissions as the normal "Textos" list; the pages are 100 rows at most, so it reads until a page comes back short. */
async function loadAll<T = TextRow>(get: ReturnType<typeof useFetchClient>['get'], locale: string, uid = UID): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const { data } = await get<{ results: T[] }>(`/content-manager/collection-types/${uid}`, { params: { locale, page, pageSize: 100, sort: 'sortKey:asc' } });
    rows.push(...data.results);
    if (data.results.length < 100) return rows;
  }
}

const TextField = ({ row, english, status, onSave }: { row: TextRow; english?: string; status?: Status; onSave: (row: TextRow, value: string) => void }) => {
  const [value, setValue] = useState(row.value ?? '');
  const Input = isLong(row) ? Textarea : TextInput;
  const tokens = /\{\w+\}/.test(row.value ?? '');
  return (
    <Field.Root width="100%">
      <Flex gap={2} alignItems="baseline" wrap="wrap">
        <Field.Label>{rowName(row)}</Field.Label>
        <Typography variant="pi" textColor="neutral500">{row.key}</Typography>
        {status && <Typography variant="pi" textColor={status === 'error' ? 'danger600' : status === 'saved' ? 'success600' : 'neutral600'} role="status">{STATUS_TEXT[status]}</Typography>}
      </Flex>
      <Input
        name={row.documentId}
        value={value}
        onChange={(e: { target: { value: string } }) => setValue(e.target.value)}
        onBlur={() => value !== (row.value ?? '') && value.trim() && onSave(row, value)}
      />
      {row.note && <Typography variant="pi" textColor="neutral600">{row.note}</Typography>}
      {tokens && <Typography variant="pi" textColor="neutral600">Lo que va entre llaves, como {'{tour}'}, se rellena solo: no lo cambies ni lo borres.</Typography>}
      {english ? <Typography variant="pi" textColor="neutral500">Inglés: {english}</Typography> : <Typography variant="pi" textColor="neutral500">Inglés: aún sin texto</Typography>}
    </Field.Root>
  );
};

/** Library images are absolute URLs; the old `imageUrl` may be relative to the website, which the panel cannot show. */
const thumb = (r: Slot) => [r.image?.url, r.poster?.url, r.imageUrl, r.posterUrl].find((u) => u && !u.startsWith('/') || u?.startsWith('/uploads'));

const MediaCard = ({ row, n }: { row: Slot; n: number }) => {
  const src = thumb(row);
  const isVideo = !!(row.video || row.videoUrl);
  return (
    <Flex gap={4} alignItems="flex-start" wrap="wrap">
      <Box width="160px" height="100px" background="neutral100" hasRadius style={{ overflow: 'hidden', flexShrink: 0 }}>
        {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Flex height="100%" justifyContent="center" padding={2}><Typography variant="pi" textColor="neutral500">Sin vista previa</Typography></Flex>}
      </Box>
      <Flex direction="column" alignItems="flex-start" gap={1} style={{ flex: 1, minWidth: 200 }}>
        <Typography fontWeight="bold">Imagen {n}</Typography>
        <Typography variant="pi" textColor="neutral500">{row.key}{isVideo ? ' · video' : ''}</Typography>
        <Typography variant="pi" textColor="neutral600">{imageHelp(row.key, row.page, row.section)}</Typography>
        <Button variant="secondary" size="S" tag={NavLink} to={`/content-manager/collection-types/${MEDIA}/${row.documentId}?plugins[i18n][locale]=es`}>Cambiar imagen</Button>
      </Flex>
    </Flex>
  );
};

const TextosPage = () => {
  const { get, put } = useFetchClient();
  const [mode, setMode] = useState<'texts' | 'images'>('texts');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [rows, setRows] = useState<TextRow[] | null>(null);
  const [english, setEnglish] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState<string>();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Record<string, Status>>({});

  useEffect(() => {
    // English is read-only context: if it cannot be read, the screen still works.
    loadAll(get, 'es').then(setRows, () => setFailed(true));
    loadAll<Slot>(get, 'es', MEDIA).then(setSlots, () => undefined);
    loadAll(get, 'en').then((en) => setEnglish(Object.fromEntries(en.map((r) => [r.key, r.value ?? '']))), () => undefined);
  }, [get]);

  const groups: PageGroup<Slot>[] = useMemo(() => groupTexts<Slot>((mode === 'texts' ? rows : slots) ?? [], query), [mode, rows, slots, query]);
  const searching = query.trim() !== '';
  const shown = searching ? groups : groups.filter((g) => g.page === (page ?? groups[0]?.page));

  const save = async (row: TextRow, value: string) => {
    setStatus((s) => ({ ...s, [row.documentId]: 'saving' }));
    try {
      await put(`${BASE}/${row.documentId}`, { value }, { params: { locale: 'es' } });
      row.value = value; // the field compares against it, so a second blur without edits does not save again
      setStatus((s) => ({ ...s, [row.documentId]: 'saved' }));
    } catch {
      setStatus((s) => ({ ...s, [row.documentId]: 'error' }));
    }
  };

  return (
    <Layouts.Root>
      <Layouts.Header
        title={mode === 'texts' ? 'Textos por página' : 'Imágenes por página'}
        subtitle={mode === 'texts' ? 'Elige una página y cambia sus textos en español. Se guarda al salir de cada campo. Se publica al guardar: la web lo muestra en menos de un minuto.' : 'Cada imagen con su página y sección. "Cambiar imagen" abre su ficha, donde eliges o subes la foto y guardas. Se publica al guardar.'}
      />
      <Layouts.Content>
        <Flex gap={2} paddingBottom={4}>
          {(['texts', 'images'] as const).map((m) => <Button key={m} variant={mode === m ? 'default' : 'tertiary'} onClick={() => { setMode(m); setPage(undefined); }}>{m === 'texts' ? 'Textos' : 'Imágenes'}</Button>)}
        </Flex>
        {failed && <Typography textColor="danger600">No se pudieron cargar los textos. Recarga la página; si sigue igual, avisa al equipo técnico.</Typography>}
        {!rows && !failed && <Loader>Cargando textos…</Loader>}
        <Box background="primary100" hasRadius padding={4} marginBottom={5}>
          <Typography fontWeight="bold">Cómo se usa</Typography>
          <Typography tag="ol" display="block" variant="omega" style={{ margin: 0, paddingLeft: 20, listStyle: "decimal" }}>
            <li>Elige la página arriba (o escribe en el buscador).</li>
            <li>{mode === 'texts' ? 'Cambia el texto y sal del campo: se guarda solo.' : 'Pulsa "Cambiar imagen", elige o sube la foto y guarda.'}</li>
            <li>La web se actualiza en menos de un minuto. Para decir cuál cambiar: "la imagen 7 de Inicio".</li>
          </Typography>
        </Box>
        {rows && (mode === 'texts' || slots) && (
          <Flex direction="column" alignItems="stretch" gap={5}>
            <TextInput aria-label="Buscar texto" placeholder={mode === 'texts' ? 'Buscar en todos los textos…' : 'Buscar imagen…'} name="search" value={query} onChange={(e: { target: { value: string } }) => setQuery(e.target.value)} />
            {!searching && (
              <Flex gap={2} wrap="wrap">
                {groups.map((g) => (
                  <Button key={g.page} size="S" variant={g.page === shown[0]?.page ? 'default' : 'tertiary'} onClick={() => setPage(g.page)}>
                    {g.title} ({g.count})
                  </Button>
                ))}
              </Flex>
            )}
            {searching && !groups.length && <Typography textColor="neutral600">Ningún texto coincide con "{query}".</Typography>}
            {shown.map((g) =>
              g.sections.map((s) => (
                <Box key={s.id} background="neutral0" hasRadius shadow="filterShadow" padding={6}>
                  <Typography variant="delta" tag="h2">Sección {s.n} · {searching ? `${g.title} › ${s.title}` : s.title}</Typography>
                  {mode === 'texts' && <Typography variant="pi" textColor="neutral600">{textHelp(g.page, s.id.split('/')[1])} Se publica al guardar.</Typography>}
                  <Flex direction="column" alignItems="stretch" gap={5} paddingTop={4}>
                    {s.rows.map((r, i) => mode === 'images' ? <MediaCard key={r.documentId} row={r} n={s.start + i + 1} /> : (
                      <TextField key={r.documentId} row={r} english={english[r.key]} status={status[r.documentId]} onSave={save} />
                    ))}
                  </Flex>
                </Box>
              )),
            )}
          </Flex>
        )}
      </Layouts.Content>
    </Layouts.Root>
  );
};

export default TextosPage;
