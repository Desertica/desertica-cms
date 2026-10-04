# Contrato con el frontend (`desertica-web`)

El frontend Angular lee de este CMS en el servidor (SSR/prerender) y reenvia los formularios. Cambiar un nombre de campo de abajo rompe el mapper del frontend (`src/app/core/cms/cms-mapper.ts`), asi que cualquier cambio de esquema debe coordinarse con ese repo.

## Endpoints usados

Todos publicos (rol Public), lectura con `?locale=en|es` y paginacion `pagination[pageSize]=100`.

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/destinations`, `/api/tours` | catalogo, orden por `order:asc` |
| GET | `/api/translations` | textos de interfaz, orden `key:asc` |
| GET | `/api/media-slots`, `/api/pages`, `/api/blog-posts`, `/api/products` | imagenes, paginas legales/hubs, blog, productos |
| GET | `/api/site-setting` | contacto, redes, razon social |
| POST | `/api/reservations`, `/api/contact-messages` | formularios (cuerpo `{ "data": { ... } }`) |

`populate=*` solo llega al primer nivel: los medios dentro de componentes necesitan rutas explicitas. Consulta de tours que usa el frontend (corchetes sin codificar por legibilidad):

```
/api/tours?locale=es
  &populate[destination][fields][0]=slug
  &populate[image]=true&populate[gallery]=true&populate[itineraryFile]=true
  &populate[practices]=true&populate[paragraphs]=true&populate[expandedParagraphs]=true
  &populate[included]=true&populate[excluded]=true&populate[pack]=true&populate[notes]=true
  &populate[itinerary][populate][0]=image
  &populate[videos][populate][0]=poster&populate[videos][populate][1]=webm&populate[videos][populate][2]=mp4
```

Otras colecciones: `destinations` -> `populate[image]`; `media-slots` -> `image`, `video`, `poster`; `pages` -> `heroImage`; `blog-posts` -> `cover`; `products` -> `image`, `gallery`.

## Tipos de contenido

Localizados = un valor por idioma (`en` por defecto, `es`). El resto se sincroniza entre idiomas.

| Tipo | Campos no localizados | Campos localizados |
| --- | --- | --- |
| `destination` | `slug`, `order`, `image`, `imageUrl` | `title`, `lead`, `allLabel` |
| `tour` | `slug`, `order`, `destination`, `durationHours`, `priceFrom`, `featured`, `format` (`shared`/`private`/`both`), `languages` (json), `image`, `imageUrl`, `gallery`, `galleryUrls`, `itineraryFile`, `itineraryFileUrl` | `title`, `description`, `lead`, `meeting`, `termsSummary`, `paragraphs[]`, `expandedParagraphs[]`, `practices[]`, `itinerary[]`, `videos[]`, `included[]`, `excluded[]`, `pack[]`, `notes[]` |
| `translation` | `key`, `group` | `value` |
| `media-slot` | `key`, `image`, `imageUrl`, `video`, `videoUrl`, `videoWebmUrl`, `poster`, `posterUrl` | `alt` |
| `page` | `slug`, `heroImage`, `heroImageUrl` | `title`, `lead`, `body` (Markdown), `seoTitle`, `seoDescription` |
| `blog-post` | `slug`, `publishedDate`, `cover`, `coverUrl`, `featured` | `title`, `category`, `excerpt`, `content` (Markdown), `seoDescription` |
| `product` | `slug`, `order`, `price`, `featured`, `image`, `imageUrl`, `gallery` | `title`, `description`, `details` (Markdown) |
| `site-setting` (single) | `email`, `phone`, `whatsapp` (solo digitos), `instagram`, `facebook`, `tiktok`, `youtube`, `linkedin`, `google`, `tripadvisor`, `legalName`, `ruc` | - |
| `reservation` (solo `create`) | `tourSlug`, `tourTitle`, `date`, `language`, `format`, `adults`, `children`, `payment`, `amount`, `locale`, `name`, `email`, `phone`, `notes`, `status` | - |
| `contact-message` (solo `create`) | `name`, `email`, `whatsapp`, `country`, `message`, `locale`, `handled` | - |

Componentes (`shared.*`): `feature` {icon, title, body}, `stop` {image, imageUrl, title, body, expandedBody}, `video` {poster, posterUrl, webm, webmUrl, mp4, mp4Url}, `list-item` {text}.

Un medio subido (`image`, `poster`, ...) tiene prioridad sobre su campo `*Url`; las rutas relativas (`/uploads/...`) se resuelven con `STRAPI_PUBLIC_URL` en el frontend.

## Claves de texto

`translation.key` es la misma clave i18n que usa el frontend (`nav.blog`, `footer.terms`, ...) y sobrescribe los JSON del frontend. Los textos de tours y destinos viajan en sus propios campos; el frontend los registra como `cms.tours.<slug>.<campo>` y `cms.destinations.<slug>.<campo>`. Los `media-slot` usados: `home.hero`, `blog.hero`, `products.hero`, `tours.banner`, `tours.closer`, `contact.band`, `about.trio`, `about.archive.1..12`, `about.video`, `footer.stamp.mincetur`, `footer.stamp.complaints`.

## Variables que el frontend necesita

En el servidor Angular (no en el navegador):

| Variable | Descripcion |
| --- | --- |
| `STRAPI_URL` | URL base del CMS; vacia = el frontend usa su catalogo estatico |
| `STRAPI_PUBLIC_URL` | URL desde la que el navegador carga los medios (por defecto `STRAPI_URL`) |
| `STRAPI_API_TOKEN` | opcional, token de solo lectura si se quita el permiso publico |
| `STRAPI_FORMS_TOKEN` | opcional, token para reenviar formularios |
| `FORMS_PROXY_SECRET` | mismo valor aqui y en el frontend: el limite de peticiones usa la IP real del visitante |
| `STRAPI_CACHE_TTL_MS` | cache del servidor, por defecto 30000 |

En el CMS: `CLIENT_URLS` (CORS) debe incluir el origen del frontend, y `PUBLIC_URL` la URL publica del CMS.

## Despliegue y reconstruccion

Las paginas SSG del frontend fijan el contenido al construir: configurar un webhook de Strapi (Settings > Webhooks, eventos `entry.publish`/`entry.unpublish`) que dispare el despliegue del frontend. `/blog`, `/products` y los tours nuevos se leen por peticion.
