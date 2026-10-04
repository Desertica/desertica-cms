# Desertica CMS (Strapi 5)

Backend de contenido para el sitio Angular de Desertica (tours en Ica, Huacachina, Paracas y Nazca). Bilingue `en` (por defecto) y `es`.

> Este proyecto es independiente del frontend. El contrato con la app Angular (campos, endpoints, variables) esta en [`CONTRACT.md`](CONTRACT.md).

## Puesta en marcha

Requiere Node 20 a 24 o 26 (probado con Node 22).

```bash
cd cms
cp .env.example .env      # reemplazar los secretos (openssl rand -base64 16; APP_KEYS = 4 valores)
npm install
npm run develop           # http://localhost:1337/admin
```

La primera vez, `/admin` pide crear el usuario administrador. Para produccion: `npm run build && npm run start`.

`.env` y `.tmp/` estan ignorados por git. Base de datos: sqlite (`.tmp/data.db`) por defecto; para Postgres usar `DATABASE_CLIENT=postgres` y las variables `DATABASE_*`.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `HOST`, `PORT` | Direccion del servidor (0.0.0.0:1337) |
| `PUBLIC_URL` | URL publica del CMS |
| `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY`, `JWT_SECRET` | Secretos |
| `DATABASE_CLIENT` (`sqlite`/`postgres`), `DATABASE_FILENAME`, `DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD/SSL` | Base de datos |
| `CLIENT_URLS` | Origenes CORS (lista con comas) |
| `SEED_ON_EMPTY` | `false` desactiva el seed inicial |
| `STRAPI_PLUGIN_I18N_INIT_LOCALE_CODE` | Locale por defecto (`en`) |

## Modelo de contenido

| Tipo | i18n | Draft/Publish | Campos |
| --- | --- | --- | --- |
| `destination` | si | si | no localizados: `slug`, `order`, `imageUrl`, `image`; localizados: `title`, `lead`, `allLabel`; relacion `tours` |
| `tour` | si | si | no localizados: `slug`, `order`, `durationHours`, `priceFrom`, `featured`, `format`, `languages`, `imageUrl`, `image`, `galleryUrls`, `gallery`, `itineraryFile`, `itineraryFileUrl`, `destination`; localizados: `title`, `description`, `lead`, `meeting`, `termsSummary`, `paragraphs`, `expandedParagraphs` (`shared.list-item`), `practices` (`shared.feature`), `itinerary` (`shared.stop`: `image`, `imageUrl`, `title`, `body`, `expandedBody`), `videos` (`shared.video`: `poster`/`posterUrl`, `webm`/`webmUrl`, `mp4`/`mp4Url`), `included`, `excluded`, `pack`, `notes` (`shared.list-item`) |
| `reservation` | no | no | `tourSlug`, `tourTitle`, `date`, `language`, `format`, `adults`, `children`, `payment`, `amount`, `locale`, `name`, `email`, `phone`, `status`, `notes` |
| `contact-message` | no | no | `name`, `email`, `whatsapp`, `country`, `message`, `locale`, `handled` |
| `site-setting` (single) | no | no | `email`, `phone`, `whatsapp`, redes (`instagram`, `facebook`, `tiktok`, `youtube`, `linkedin`, `google`, `tripadvisor`), `legalName`, `ruc` |
| `translation` | si | no | no localizados: `key`, `group`; localizado: `value` (todas las cadenas de `src/locales/{en,es}.json`) |
| `media-slot` | si | no | no localizados: `key`, `image`/`imageUrl`, `video`/`videoUrl`/`videoWebmUrl`, `poster`/`posterUrl`; localizado: `alt` |
| `page` | si | si | no localizados: `slug`, `heroImage`, `heroImageUrl`; localizados: `title`, `lead`, `body` (Markdown), `seoTitle`, `seoDescription` |
| `blog-post` | si | si | no localizados: `slug`, `publishedDate`, `cover`, `coverUrl`, `featured`; localizados: `title`, `category`, `excerpt`, `content` (Markdown), `seoDescription` |
| `product` | si | si | no localizados: `slug`, `order`, `price`, `featured`, `image`, `imageUrl`, `gallery`; localizados: `title`, `description`, `details` (Markdown) |

Las imagenes pueden venir de `imageUrl`/`galleryUrls`/`itineraryFileUrl` (URLs externas, p. ej. Unsplash) o de los campos media (`image`, `gallery`, `itineraryFile`, `itinerary[].image`, `videos[].poster/webm/mp4`) subidos a la libreria de medios; la app debe preferir el media si existe.

## Seed

Al arrancar (idempotente) el bootstrap: crea el locale `es`, concede permisos publicos y, si no hay destinos y `SEED_ON_EMPTY` no es `false`, carga `seed/catalog.json` (3 destinos, 15 tours, 267 traducciones, 22 media-slots, 7 paginas, ambos idiomas, publicados) y los datos de `site-setting`. Un fallo del seed se registra y no impide el arranque. Los datos de contacto de `site-setting` son marcadores (`XXXX`): editarlos desde el admin.

`seed/catalog.json` es la fuente del seed y se versiona aqui. Se genero desde el catalogo estatico de la app Angular y sus `src/locales/{en,es}.json` con `scripts/build-cms-seed.mjs`, que vive en el repo del frontend (`desertica-web`):

```bash
# desde la raiz de desertica-web, con este repo clonado al lado
node scripts/build-cms-seed.mjs --out ../desertica-cms/seed/catalog.json
```

Una vez en produccion el seed solo se usa en bases vacias; el contenido real se edita desde el admin.

Para resembrar, borrar `.tmp/data.db` (solo desarrollo) y reiniciar.

## Permisos publicos

El rol Public solo recibe: `destination` find/findOne, `tour` find/findOne, `site-setting` find, `reservation` create `contact-message` create y find/findOne de `translation`, `media-slot`, `page`, `blog-post` y `product`. Las altas (`create`) tienen limite por IP (`global::rate-limit`): 10 reservas y 5 mensajes cada 10 minutos (en memoria, por instancia).

## Consumo desde Angular

La app usa `STRAPI_URL` y estos endpoints:

- `GET /api/destinations?locale=es`
- `GET /api/tours?locale=es&populate[destination][fields][0]=slug&populate[image]=true&populate[gallery]=true&populate[itineraryFile]=true&populate[practices]=true&populate[paragraphs]=true&populate[expandedParagraphs]=true&populate[termsSummary]=true&populate[itinerary][populate]=image&populate[videos][populate]=poster,webm,mp4&populate[included]=true&populate[excluded]=true&populate[pack]=true&populate[notes]=true`
- `GET /api/site-setting`
- `GET /api/translations?locale=es&pagination[pageSize]=200&pagination[page]=1&fields[0]=key&fields[1]=value` (2 paginas, 267 claves)
- `GET /api/media-slots?locale=es&populate=image,video,poster`, `GET /api/pages?locale=es`, `/api/blog-posts`, `/api/products`
- `POST /api/reservations` con `{ "data": { ... } }`
- `POST /api/contact-messages` con `{ "data": { ... } }`

## Publicar contenido

En el admin, `Content Manager` > `Destination`/`Tour`: editar, cambiar de idioma con el selector de locale (los campos no localizados se comparten) y pulsar `Publish` en cada idioma. Solo el contenido publicado aparece en la API publica. Reservas y mensajes se gestionan en el admin (`status`, `handled`).

## Formularios y limite de peticiones

El frontend no llama a Strapi desde el navegador: `POST /api/forms/reservation` y `/api/forms/contact` (Express) validan y reenvian a `POST /api/reservations` y `/api/contact-messages`. Como todas las peticiones llegan desde el servidor Angular, el limite de `global::rate-limit` usa la IP real del visitante solo si la peticion trae `X-Forms-Secret` igual a `FORMS_PROXY_SECRET` (definir el mismo valor aqui y en el servidor Angular). Sin secreto, el limite se aplica por IP del proxy.

Nota: en Strapi 5 `populate=*` solo baja un nivel (componentes si, pero NO los media anidados como `itinerary[].image` o `videos[].poster`); para esos usar `populate[itinerary][populate]=image` y `populate[videos][populate]=poster,webm,mp4`.
