# Contrato con el frontend (`desertica-web`)

El frontend Angular lee de este CMS en el servidor (SSR/prerender) y reenvia los formularios. Cambiar un nombre de campo de abajo rompe el mapper del frontend (`src/app/core/cms/cms-mapper.ts`), asi que cualquier cambio de esquema debe coordinarse con ese repo.

## Endpoints usados

Todos publicos (rol Public), lectura con `?locale=en|es` y paginacion `pagination[pageSize]=100`.

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/destinations`, `/api/tours` | catalogo, orden por `order:asc` |
| GET | `/api/translations` | textos de interfaz, orden `key:asc` |
| GET | `/api/media-slots`, `/api/pages`, `/api/blog-posts`, `/api/products` | imagenes, paginas legales/hubs, blog, productos |
| GET | `/api/site-setting` | contacto, redes, razon social, marca, imagen para compartir |
| GET | `/api/theme-setting`, `/api/booking-setting`, `/api/form-setting`, `/api/navigation` | tema, reglas de reserva, limites de formularios, menus (los dos ultimos con `?locale=`; `booking-setting` y `navigation` son localizados) |
| POST | `/api/reservations`, `/api/contact-messages` | formularios (cuerpo `{ "data": { ... } }`) |

`populate=*` solo llega al primer nivel: los medios dentro de componentes necesitan rutas explicitas. Consulta de tours que usa el frontend (corchetes sin codificar por legibilidad):

```
/api/tours?locale=es
  &populate[destination][fields][0]=slug
  &populate[image]=true&populate[gallery]=true&populate[itineraryFile]=true
  &populate[practices]=true&populate[paragraphs]=true&populate[expandedParagraphs]=true
  &populate[included]=true&populate[excluded]=true&populate[pack]=true&populate[notes]=true
  &populate[assurances]=true
  &populate[itinerary][populate][0]=image
  &populate[videos][populate][0]=poster&populate[videos][populate][1]=webm&populate[videos][populate][2]=mp4
```

Single types (corchetes sin codificar):

```
/api/site-setting?populate[shareImage]=true
/api/theme-setting?populate[light]=true&populate[dark]=true
/api/booking-setting?locale=es&populate[assurances]=true
/api/form-setting
/api/navigation?locale=es&populate[headerLinks]=true&populate[footerBrandLinks]=true&populate[footerLegalLinks]=true
```

Otras colecciones: `destinations` -> `populate[image]`; `media-slots` -> `image`, `video`, `poster`; `pages` -> `heroImage`; `blog-posts` -> `cover`; `products` -> `image`, `gallery`.

## Tipos de contenido

Localizados = un valor por idioma (`en` por defecto, `es`). El resto se sincroniza entre idiomas.

| Tipo | Campos no localizados | Campos localizados |
| --- | --- | --- |
| `destination` | `slug`, `order`, `footerOrder`, `showInFooter`, `image`, `imageUrl` | `title`, `lead`, `allLabel` |
| `tour` | `slug`, `order`, `destination`, `durationHours`, `priceFrom`, `featured`, `format` (`shared`/`private`/`both`), `languages` (json), `image`, `imageUrl`, `gallery`, `galleryUrls`, `itineraryFile`, `itineraryFileUrl` | `title`, `seoTitle`, `seoDescription`, `assurances[]` (opcional, sustituye las globales), `description`, `lead`, `meeting`, `termsSummary`, `paragraphs[]`, `expandedParagraphs[]`, `practices[]`, `itinerary[]`, `videos[]`, `included[]`, `excluded[]`, `pack[]`, `notes[]` |
| `translation` | `key`, `group`, `page`, `section`, `label`, `note`, `kind` (`short`/`long`) | `value` |
| `media-slot` | `key`, `page`, `section`, `description`, `image`, `imageUrl`, `video`, `videoUrl`, `videoWebmUrl`, `poster`, `posterUrl` | `alt` |
| `page` | `slug`, `heroImage`, `heroImageUrl` | `title`, `lead`, `body` (Markdown), `seoTitle`, `seoDescription` |
| `blog-post` | `slug`, `publishedDate`, `cover`, `coverUrl`, `featured` | `title`, `category`, `excerpt`, `content` (Markdown), `seoDescription` |
| `product` | `slug`, `order`, `price`, `featured`, `image`, `imageUrl`, `gallery` | `title`, `description`, `details` (Markdown) |
| `site-setting` (single) | `email`, `phone`, `whatsapp` (solo digitos), `instagram`, `facebook`, `tiktok`, `youtube`, `linkedin`, `google`, `tripadvisor`, `legalName`, `ruc`, `brandName`, `legalYear`, `shareImage`, `shareImageUrl` | - |
| `theme-setting` (single) | `light`, `dark` (`theme.palette`), `fontSans`, `fontHeading` (enum: `radio-canada`, `inter`, `poppins`, `montserrat`, `dm-sans`, `playfair-display`, `lora`, `merriweather`, `system`), `radius` (enum: `none`, `small`, `medium`, `large`, `full`), `headerSize` (enum: `compact`, `standard`, `tall`), `introEnabled`, `introAccent` (hex), `introRestScale`, `introFailsafeMs` | - |
| `booking-setting` (single) | `depositRate` (0..1), `adultsMin`, `adultsDefault`, `childrenMin`, `childrenDefault`, `peopleMax`, `currencyCode` | `assurances[]` (`shared.feature`) |
| `form-setting` (single) | `nameMin`, `nameMax`, `emailMax`, `messageMax` | - |
| `navigation` (single) | - | `headerLinks[]`, `footerBrandLinks[]`, `footerLegalLinks[]` (`shared.nav-link`), `planTripLabel`, `planTripPath` |
| `reservation` (solo `create`) | `tourSlug`, `tourTitle`, `date`, `language`, `format`, `adults`, `children`, `payment`, `amount`, `locale`, `name`, `email`, `phone`, `notes`, `status` | - |
| `contact-message` (solo `create`) | `name`, `email`, `whatsapp`, `country`, `message`, `locale`, `handled` | - |

Componentes: `theme.palette` {background, foreground, card, cardForeground, popover, popoverForeground, primary, primaryForeground, secondary, secondaryForeground, muted, mutedForeground, accent, accentForeground, destructive, border, input, ring, tierra, tierraForeground, arena, arenaForeground} (cada uno un hex `#rrggbb` o `#rrggbbaa`, validado por regex, elegido con el selector de color `plugin::color-picker.color`; `light` se aplica en `:root`, `dark` bajo la clase `.dark`). Equivalencias: `radius` none=0, small=0.25rem, medium=0.625rem, large=1rem, full=pill; `headerSize` compact=3rem/3.5rem/4rem, standard=3.5rem/4rem/5rem, tall=4rem/5rem/6rem (movil/640px/1024px) — la tabla exacta la define el frontend. `shared.nav-link` {label, path, fragment, kind: `link`|`tours-menu`}: `tours-menu` marca el item del header cuyo desplegable el frontend construye con destinos y tours. `shared.*`: `feature` {icon, title, body}, `stop` {image, imageUrl, title, body, expandedBody}, `video` {poster, posterUrl, webm, webmUrl, mp4, mp4Url}, `list-item` {text}.

Un medio subido (`image`, `poster`, ...) tiene prioridad sobre su campo `*Url`; las rutas relativas (`/uploads/...`) se resuelven con `STRAPI_PUBLIC_URL` en el frontend.

## Claves de texto

`translation.key` es la misma clave i18n que usa el frontend (`nav.blog`, `footer.terms`, ...) y sobrescribe los JSON del frontend. `translation.page`/`section`/`label`/`note`/`kind` solo organizan el admin. Los textos de tours y destinos viajan en sus propios campos (no hay `translation` para `nav.<tour>`, `nav.<tour>Desc`, `footer.<destino>*`, `pages.<destino>Lead`, `tour.meetingIca`, `tours.*`); el frontend los registra como `cms.tours.<slug>.<campo>` y `cms.destinations.<slug>.<campo>`. Los `media-slot` usados: `home.hero`, `blog.hero`, `products.hero`, `tours.banner`, `tours.closer`, `contact.band`, `about.trio`, `about.archive.1..12`, `about.video`, `footer.stamp.mincetur`, `footer.stamp.complaints`.

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

## Publicacion de cambios

El frontend renderiza todas sus rutas por peticion y lee el CMS con una cache de servidor corta (`STRAPI_CACHE_TTL_MS`, 30 s por defecto): lo publicado se ve en menos de ese tiempo, sin webhook ni reconstruccion. Si el CMS no responde, el frontend sirve la ultima respuesta buena y, si no hay, sus valores por defecto.
