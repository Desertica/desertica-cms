# Desertica CMS (Strapi 5)

Backend de contenido para el sitio Angular de Desertica (tours en Ica, Huacachina, Paracas y Nazca). Bilingue `en` (por defecto) y `es`.

> Este proyecto es independiente del frontend. El contrato con la app Angular (campos, endpoints, variables) esta en [`CONTRACT.md`](CONTRACT.md).

## Puesta en marcha

Requiere Node 22 (`.nvmrc`).

```bash
cp .env.example .env      # reemplazar los secretos (openssl rand -base64 16; APP_KEYS = 4 valores)
npm ci
npm run develop           # http://localhost:1337/admin
```

La primera vez, `/admin` pide crear el usuario administrador. Para produccion: `npm run build && npm run start`.

`.env` y `.tmp/` estan ignorados por git. Base de datos: sqlite (`.tmp/data.db`) por defecto; para Postgres usar `DATABASE_CLIENT=postgres` y las variables `DATABASE_*`.

Despliegue (Docker, Postgres, S3, respaldos, seguridad): [`docs/DEPLOY.md`](docs/DEPLOY.md). Imagen: `ghcr.io/desertica/desertica-cms`.

```bash
docker compose up -d --build   # cms + postgres 16, volumenes pgdata y uploads
```

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `HOST`, `PORT` | Direccion del servidor (0.0.0.0:1337) |
| `PUBLIC_URL` | URL publica del CMS |
| `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY`, `JWT_SECRET` | Secretos |
| `DATABASE_CLIENT` (`sqlite`/`postgres`), `DATABASE_FILENAME`, `DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD/SSL` | Base de datos |
| `CLIENT_URLS` | Origenes CORS (lista con comas); obligatoria en produccion |
| `SEED_ON_EMPTY` | `false` desactiva el seed inicial |
| `STRAPI_PLUGIN_I18N_INIT_LOCALE_CODE` | Locale por defecto (`en`) |
| `PROXY` | `true` detras de un proxy inverso con TLS |
| `UPLOAD_PROVIDER` (`local`/`aws-s3`), `UPLOAD_MAX_FILE_SIZE_MB` (200), `S3_*`, `MEDIA_HOSTS` | Medios: proveedor, limite por archivo, bucket/credenciales/endpoint/URL publica, hosts extra de la CSP |
| `FORMS_PROXY_SECRET` | Secreto compartido con el servidor Angular. **Obligatorio en produccion** (el CMS no arranca sin el): los formularios solo se aceptan con la cabecera `X-Forms-Secret`, y el limite de peticiones (10 por IP cada 10 minutos en cada formulario) usa la IP real que reenvia la web |
| `PREVIEW_URL`, `PREVIEW_SECRET` | Vista previa en el editor: la web recibe `?preview=<exp>.<firma>` (firma = HMAC-SHA256 hex de `<exp>:<ruta>`, 10 minutos). Sin ellas no hay boton |
| `NOTIFY_EMAIL`, `SMTP_HOST/PORT/USER/PASSWORD/SECURE`, `MAIL_FROM` | Aviso por correo de reservas y mensajes nuevos (solo con `SMTP_HOST` y `NOTIFY_EMAIL`); un fallo de envio nunca afecta al formulario |
| `FLAG_PROMOTE_EE`, `FLAG_NPS` | Avisos de pago y encuesta del panel (apagados por defecto) |
| `CMS_HOST_PORT` | Solo Docker Compose: puerto publicado |

## Medios y verificacion de subidas

Con el proveedor local los medios quedan en `public/uploads` y la API devuelve `url` **relativa** (`/uploads/<nombre>_<hash>.<ext>`); el frontend la resuelve con `STRAPI_PUBLIC_URL`. `PUBLIC_URL` no la vuelve absoluta; con `UPLOAD_PROVIDER=aws-s3` la URL es absoluta (`S3_PUBLIC_URL`). Los videos se sirven con `Accept-Ranges: bytes` (206 para `Range`), necesario para reproducir y buscar. El limite por archivo es `UPLOAD_MAX_FILE_SIZE_MB` (200 por defecto). Las imagenes se optimizan y generan miniaturas (`formats`: thumbnail/small/medium/large).

`scripts/verify-uploads.mjs` (Node >= 20, sin dependencias) prueba todo esto contra una instancia en marcha: sube imagen, PNG, PDF, WebM y MP4 por `POST /api/upload`, los adjunta a tour `dune-buggy`, destino `huacachina`, media-slots `about.video`/`about.trio`, pagina `terms`, `site-setting`, y a un blog-post y un producto nuevos (en y es), lee la API publica con los mismos populate del frontend, descarga cada URL (estado, content-type, tamano, Range de video) y restaura/borra todo lo que toco.

```bash
CMS_URL=http://localhost:1337 CMS_ADMIN_EMAIL=tu@correo CMS_ADMIN_PASSWORD='...' \
  node scripts/verify-uploads.mjs
# opcionales: SAMPLES_DIR=<public de desertica-web> (medios reales), CMS_PUBLIC_URL=<prefijo esperado de las URLs>,
#             VERIFY_BIG_MB=200 (prueba el limite de tamano), KEEP_DATA=true (no limpiar)
```

Usa una base de pruebas o local: crea y borra un token de API temporal, y el login del admin tiene limite de intentos (el script espera y reintenta una vez ante un 429). Las nuevas versiones de idioma de documentos nuevos se crean por el Content Manager porque la API REST rechaza el mismo `slug` en un segundo idioma ("This attribute must be unique").

## Modelo de contenido

| Tipo | i18n | Draft/Publish | Campos |
| --- | --- | --- | --- |
| `destination` | si | si | no localizados: `slug`, `order`, `footerOrder`, `showInFooter`, `imageUrl`, `image`; localizados: `title`, `lead`, `allLabel`; relacion `tours` |
| `tour` | si | si | no localizados: `slug`, `order`, `durationHours`, `priceFrom`, `featured`, `format`, `languages`, `imageUrl`, `image`, `galleryUrls`, `gallery`, `itineraryFile`, `itineraryFileUrl`, `destination`; localizados: `title`, `description`, `lead`, `meeting`, `termsSummary`, `seoTitle`, `seoDescription`, `assurances` (`shared.feature`, opcional: sustituye las de `booking-setting`), `paragraphs`, `expandedParagraphs` (`shared.list-item`), `practices` (`shared.feature`), `itinerary` (`shared.stop`: `image`, `imageUrl`, `title`, `body`, `expandedBody`), `videos` (`shared.video`: `poster`/`posterUrl`, `webm`/`webmUrl`, `mp4`/`mp4Url`), `included`, `excluded`, `pack`, `notes` (`shared.list-item`) |
| `reservation` (legado, ver nota) | no | no | `tourSlug`, `tourTitle`, `date`, `language`, `format`, `adults`, `children`, `payment`, `amount`, `locale`, `name`, `email`, `phone`, `status`, `notes` |
| `contact-message` | no | no | `name`, `email`, `whatsapp`, `country`, `message`, `locale`, `handled` |
| `site-setting` (single) | no | no | `email`, `phone`, `whatsapp`, redes (`instagram`, `facebook`, `tiktok`, `youtube`, `linkedin`, `google`, `tripadvisor`), `legalName`, `ruc`, `brandName`, `legalYear`, `shareImage`/`shareImageUrl` |
| `theme-setting` (single) | no | no | `light`, `dark` (componente `theme.palette`, 22 colores en hex con selector de color, plugin oficial `@strapi/plugin-color-picker` 5.59.0, habilitado en `config/plugins.ts`), `fontSans`, `fontHeading` (selector de 9 fuentes), `radius` (none/small/medium/large/full), `headerSize` (compact/standard/tall), `introEnabled`, `introAccent`, `introRestScale`, `introFailsafeMs` |
| `booking-setting` (single) | si | no | no localizados: `depositRate` (0..1, obsoleto: el deposito lo decide el API), `availabilityMonths` (1..12, por defecto 3), `adultsMin`, `adultsDefault`, `childrenMin`, `childrenDefault`, `peopleMax`, `currencyCode`; localizado: `assurances` (`shared.feature`) |
| `form-setting` (single) | no | no | `nameMin`, `nameMax`, `emailMax`, `messageMax` |
| `navigation` (single) | si | no | localizados: `headerLinks`, `footerBrandLinks`, `footerLegalLinks` (`shared.nav-link`: `label`, `path`, `fragment`, `kind` = `link`/`tours-menu`), `planTripLabel`, `planTripPath` |
| `translation` | si | no | no localizados: `key`, `group`, `page`, `section`, `label`, `note`, `kind` (`short`/`long`); localizado: `value` (cadenas de interfaz de `src/locales/{en,es}.json`, sin las claves de tours y destinos) |
| `media-slot` | si | no | no localizados: `key`, `page`, `section`, `description`, `image`/`imageUrl`, `video`/`videoUrl`/`videoWebmUrl`, `poster`/`posterUrl`; localizado: `alt` |
| `page` | si | si | no localizados: `slug`, `heroImage`, `heroImageUrl`; localizados: `title`, `lead`, `body` (Markdown), `seoTitle`, `seoDescription` |
| `blog-post` | si | si | no localizados: `slug`, `publishedDate`, `cover`, `coverUrl`, `featured`; localizados: `title`, `category`, `excerpt`, `content` (Markdown), `seoDescription` |
| `product` | si | si | no localizados: `slug`, `order`, `price`, `featured`, `image`, `imageUrl`, `gallery`; localizados: `title`, `description`, `details` (Markdown) |

Las imagenes pueden venir de `imageUrl`/`galleryUrls`/`itineraryFileUrl` (URLs externas, p. ej. Unsplash) o de los campos media (`image`, `gallery`, `itineraryFile`, `itinerary[].image`, `videos[].poster/webm/mp4`) subidos a la libreria de medios; la app debe preferir el media si existe.

Notas del modelo:

- `tour` incluye ademas `waiverBody` (descargo de responsabilidad, localizado), `latitude`, `longitude`, `meetingPointUrl` y `faqs[]` (`shared.faq`, localizado); todos opcionales. Detalle y populate en `CONTRACT.md`.
- `reservation` es **legado**: `desertica-api` la reemplazara cuando el checkout nuevo se active. Hasta entonces se queda como esta y sus permisos publicos (`create`) no se retiran.
- Para probar con textos de ejemplo NO LEGALES (descargo, cancelacion, cookies) en un CMS de desarrollo: `docs/DEV-LEGAL-SAMPLES.md`.
- Las paginas legales `cancellation` y `cookies` se crean vacias y en borrador al arrancar (una vez); hay que redactarlas y publicarlas. Slugs por documento legal en `CONTRACT.md`.
- Webhook de publicacion (opcional): `docs/WEBHOOKS.md`.

## Organizacion del admin

El Content Manager agrupa por area gracias al `displayName` (orden alfabetico): `Sitio — ...` (Datos de la empresa, Colores y estilo, Reglas de reserva, Formularios, Menús), `Catálogo — ...` (Destino, Tour), `Textos — Texto de la web`, `Medios — Imagen o video de la web`, `Páginas — Página`, `Blog — Artículo`, `Tienda — Producto`, `Bandeja — ...` (Solicitud de reserva, Mensaje de contacto). `singularName`/`pluralName`/uid no cambian (las rutas de la API son las mismas). En el bootstrap (una sola vez, marcado en el store `plugin_desertica_content-manager-config`; subir `CM_CONFIG_VERSION` en `src/index.ts` para reaplicar) se configuran columnas, orden y tamano de pagina de las listas, y para cada campo su nombre, ayuda y ejemplo en español (`src/admin-es.ts`) y el orden de los formularios (`EDIT_LAYOUTS`). El panel se activa en español en `src/admin/app.tsx`; cada persona elige el idioma en Perfil > Idioma de la interfaz. Limite de Strapi: el orden por defecto admite un solo campo (traducciones y media-slots se ordenan por `page`; dentro de cada pagina, por orden de alta, que sigue el orden alfabetico de `key`).

## Seed

Al arrancar (idempotente) el bootstrap: crea el locale `es`, concede permisos publicos y, si no hay destinos y `SEED_ON_EMPTY` no es `false`, carga `seed/catalog.json` (3 destinos, 15 tours, 229 traducciones, 22 media-slots, 7 paginas, ambos idiomas, publicados) y los single types (`site-setting`, `theme-setting`, `form-setting`, `booking-setting`, `navigation`; cada uno una sola vez). Las 83 claves de `src/locales` que son contenido de tours y destinos (`nav.<tour>`, `nav.<tour>Desc`, `footer.<destino>*`, `pages.<destino>Lead`, `tour.meetingIca`, `tours.*`) no se siembran como traducciones: viven en `tour`/`destination`. Un fallo del seed se registra y no impide el arranque. Los datos de contacto de `site-setting` son marcadores (`XXXX`): editarlos desde el admin.

`seed/catalog.json` es la fuente del seed y se versiona aqui. Se genero desde el catalogo estatico de la app Angular y sus `src/locales/{en,es}.json` con `scripts/build-cms-seed.mjs`, que vive en el repo del frontend (`desertica-web`):

```bash
# desde la raiz de desertica-web, con este repo clonado al lado
node scripts/build-cms-seed.mjs --out ../desertica-cms/seed/catalog.json
```

Una vez en produccion el seed solo se usa en bases vacias; el contenido real se edita desde el admin.

Para resembrar, borrar `.tmp/data.db` (solo desarrollo) y reiniciar.

## Permisos publicos

El rol Public solo recibe: `destination` find/findOne, `tour` find/findOne, `site-setting`, `theme-setting`, `booking-setting`, `form-setting` y `navigation` find, `reservation` create `contact-message` create y find/findOne de `translation`, `media-slot`, `page`, `blog-post` y `product`. Las altas (`create`) tienen limite por IP (`global::rate-limit`): 10 reservas y 5 mensajes cada 10 minutos (en memoria, por instancia).

## Consumo desde Angular

La app usa `STRAPI_URL` y estos endpoints:

- `GET /api/destinations?locale=es`
- `GET /api/tours?locale=es&populate[destination][fields][0]=slug&populate[image]=true&populate[gallery]=true&populate[itineraryFile]=true&populate[practices]=true&populate[paragraphs]=true&populate[expandedParagraphs]=true&populate[termsSummary]=true&populate[itinerary][populate]=image&populate[videos][populate]=poster,webm,mp4&populate[included]=true&populate[excluded]=true&populate[pack]=true&populate[notes]=true&populate[assurances]=true`
- `GET /api/site-setting?populate[shareImage]=true`
- `GET /api/theme-setting?populate[light]=true&populate[dark]=true`
- `GET /api/booking-setting?locale=es&populate[assurances]=true`
- `GET /api/form-setting`
- `GET /api/navigation?locale=es&populate[headerLinks]=true&populate[footerBrandLinks]=true&populate[footerLegalLinks]=true`
- `GET /api/translations?locale=es&pagination[pageSize]=200&pagination[page]=1&fields[0]=key&fields[1]=value` (229 claves)
- `GET /api/media-slots?locale=es&populate=image,video,poster`, `GET /api/pages?locale=es`, `/api/blog-posts`, `/api/products`
- `POST /api/reservations` con `{ "data": { ... } }`
- `POST /api/contact-messages` con `{ "data": { ... } }`

## Publicar contenido

En el admin, `Content Manager` > `Destination`/`Tour`: editar, cambiar de idioma con el selector de locale (los campos no localizados se comparten) y pulsar `Publish` en cada idioma. Solo el contenido publicado aparece en la API publica. Reservas y mensajes se gestionan en el admin (`status`, `handled`).

## Formularios y limite de peticiones

El frontend no llama a Strapi desde el navegador: `POST /api/forms/reservation` y `/api/forms/contact` (Express) validan y reenvian a `POST /api/reservations` y `/api/contact-messages`. Como todas las peticiones llegan desde el servidor Angular, el limite de `global::rate-limit` usa la IP real del visitante solo si la peticion trae `X-Forms-Secret` igual a `FORMS_PROXY_SECRET` (definir el mismo valor aqui y en el servidor Angular). Sin secreto, el limite se aplica por IP del proxy.

Nota: en Strapi 5 `populate=*` solo baja un nivel (componentes si, pero NO los media anidados como `itinerary[].image` o `videos[].poster`); para esos usar `populate[itinerary][populate]=image` y `populate[videos][populate]=poster,webm,mp4`.
