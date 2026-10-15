# Textos de ejemplo para desarrollo (NO LEGALES)

Para que las demas sesiones (web, API, backoffice) puedan probar el descargo, la politica de cancelacion y las cookies sin esperar los textos reales. **Solo para un CMS de desarrollo. Nunca en produccion.** Cada texto empieza con un aviso `NO LEGAL: MUESTRA DE DESARROLLO` en `en` y `es`, para que no pase por real.

El script `scripts/dev-legal-samples.mjs` escribe **borradores**: no publica nada, asi que la API publica no los ve (`GET /api/pages?filters[slug]=cookies` sigue vacio) hasta que alguien pulse `Publish`.

## Con el script

1. Arrancar el CMS de desarrollo (`npm run develop`) con la base sembrada.
2. Admin > `Settings` > `API Tokens` > `Create new API Token`, tipo `Full access`, y copiar el token (no se commitea).
3. ```bash
   CMS_URL=http://localhost:1337 CMS_API_TOKEN=<token> node scripts/dev-legal-samples.mjs [--tour <slug>]
   ```
   Guarda, en `en` y `es`:
   - `page` `cancellation` y `cookies`: titulo y `body` de ejemplo (usa el borrador vacio que crea el bootstrap, o lo crea si falta).
   - `tour.waiverBody` del tour indicado con `--tour` (por defecto el primero por `order`).
4. Para que otra sesion los lea: en el admin abrir la entrada, elegir cada idioma y `Publish`. Para quitarlos: `Unpublish` y borrar el texto, o recrear la base de desarrollo.

El script es idempotente (vuelve a escribir el mismo borrador). Si una pagina o un tour ya tenia texto en borrador, lo sobrescribe: no usarlo sobre contenido real.

## A mano

`Pages — Page` > `cancellation` / `cookies` > pegar un texto con el aviso NO LEGAL en `body` por idioma. Para el descargo: `Catalog — Tour` > un tour > `waiverBody`. Cada **publicacion** del descargo crea una version nueva en el API; los pasajeros firman el texto vigente. En desarrollo conviene publicarlo una vez y no tocarlo mientras se prueba la firma.
