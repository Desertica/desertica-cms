import { useState } from 'react';
import { Box, Button, Typography } from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

/** Content types whose texts differ by language; others have nothing to translate. Pages (legal texts) are left out on purpose. */
const TRANSLATABLE = new Set([
  'api::tour.tour',
  'api::destination.destination',
  'api::blog-post.blog-post',
  'api::product.product',
  'api::translation.translation',
  'api::media-slot.media-slot',
  'api::booking-setting.booking-setting',
  'api::navigation.navigation',
]);
const NAMES: Record<string, string> = { en: 'inglés', es: 'español' };

/** Side panel of the edit view: sends the open version to DeepL and saves the result as a draft in the other language. */
const TranslatePanel = ({ model, documentId }: { model: string; documentId?: string }) => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [busy, setBusy] = useState(false);
  if (!documentId || !TRANSLATABLE.has(model)) return null;

  const from = new URLSearchParams(window.location.search).get('plugins[i18n][locale]') ?? 'en';
  const to = from === 'en' ? 'es' : 'en';

  const run = async () => {
    if (!window.confirm(`Esto reemplaza el borrador en ${NAMES[to]} con la traducción de esta versión. Lo publicado no cambia. ¿Continuar?`)) return;
    setBusy(true);
    try {
      await post('/desertica/translate', { uid: model, documentId, from, to });
      toggleNotification({ type: 'success', message: `Listo. Abre la versión en ${NAMES[to]} para revisarla y publicarla.` });
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message ?? '';
      toggleNotification({
        type: 'danger',
        message: /DEEPL_API_KEY/.test(detail) ? 'Falta configurar la clave de DeepL en el servidor.' : 'No se pudo traducir. Guarda los cambios e inténtalo otra vez.',
      });
    } finally {
      setBusy(false);
    }
  };

  return {
    title: 'Traducción automática',
    content: (
      <Box>
        <Typography variant="pi" textColor="neutral600">
          Traduce esta versión al {NAMES[to]} con DeepL. Guarda tus cambios antes. El resultado queda como borrador: revísalo y publícalo tú.
        </Typography>
        <Box paddingTop={3}>
          <Button variant="secondary" fullWidth loading={busy} onClick={run}>
            {`Traducir al ${NAMES[to]}`}
          </Button>
        </Box>
      </Box>
    ),
  };
};

export default TranslatePanel;
