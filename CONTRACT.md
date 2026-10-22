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
  &populate[assurances]=true&populate[faqs]=true
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
| `tour` | `slug`, `order`, `destination`, `durationHours`, `priceFrom`, `featured`, `imageFocus` (`center`/`top`/`bottom`/`left`/`right`, por defecto `center`: parte de la foto que queda visible al recortarla en la tarjeta), `format` (`shared`/`private`/`both`), `languages` (json), `image`, `imageUrl`, `gallery`, `galleryUrls`, `itineraryFile`, `itineraryFileUrl`, `latitude`, `longitude`, `meetingPointUrl` | `title`, `seoTitle`, `seoDescription`, `assurances[]` (opcional, sustituye las globales), `description`, `lead`, `meeting`, `termsSummary`, `paragraphs[]`, `expandedParagraphs[]`, `practices[]`, `itinerary[]`, `videos[]`, `included[]`, `excluded[]`, `pack[]`, `notes[]`, `waiverBody` (Markdown), `faqs[]` (`shared.faq`) |
| `translation` | `key`, `group`, `page`, `section`, `label`, `note`, `kind` (`short`/`long`) | `value` |
| `media-slot` | `key`, `page`, `section`, `description`, `image`, `imageUrl`, `video`, `videoUrl`, `videoWebmUrl`, `poster`, `posterUrl` | `alt` |
| `page` | `slug`, `heroImage`, `heroImageUrl` | `title`, `lead`, `body` (Markdown), `seoTitle`, `seoDescription` |
| `blog-post` | `slug`, `publishedDate`, `cover`, `coverUrl`, `featured` | `title`, `category`, `excerpt`, `content` (Markdown), `seoDescription` |
| `product` | `slug`, `order`, `price`, `featured`, `image`, `imageUrl`, `gallery` | `title`, `description`, `details` (Markdown) |
| `site-setting` (single) | `email`, `phone`, `whatsapp` (solo digitos), `instagram`, `facebook`, `tiktok`, `youtube`, `linkedin`, `google`, `tripadvisor`, `legalName`, `ruc`, `brandName`, `legalYear`, `shareImage`, `shareImageUrl` | - |
| `theme-setting` (single) | `light`, `dark` (`theme.palette`), `fontSans`, `fontHeading` (enum: `radio-canada`, `inter`, `poppins`, `montserrat`, `dm-sans`, `playfair-display`, `lora`, `merriweather`, `system`), `radius` (enum: `none`, `small`, `medium`, `large`, `full`), `headerSize` (enum: `compact`, `standard`, `tall`), `introEnabled`, `introAccent` (hex), `introRestScale`, `introFailsafeMs` | - |
| `booking-setting` (single) | `depositRate` (0..1, **obsoleto**, ver abajo), `availabilityMonths` (1..12, 3 por defecto), `adultsMin`, `adultsDefault`, `childrenMin`, `childrenDefault`, `peopleMax`, `currencyCode` | `assurances[]` (`shared.feature`) |
| `form-setting` (single) | `nameMin`, `nameMax`, `emailMax`, `messageMax` | - |
| `navigation` (single) | - | `headerLinks[]`, `footerBrandLinks[]`, `footerLegalLinks[]` (`shared.nav-link`), `planTripLabel`, `planTripPath` |
| `reservation` (solo `create`, **legado**, ver abajo) | `tourSlug`, `tourTitle`, `date`, `language`, `format`, `adults`, `children`, `payment`, `amount`, `locale`, `name`, `email`, `phone`, `notes`, `status` | - |
| `contact-message` (solo `create`) | `name`, `email`, `whatsapp`, `country`, `message`, `locale`, `handled` | - |

Componentes: `theme.palette` {background, foreground, card, cardForeground, popover, popoverForeground, primary, primaryForeground, secondary, secondaryForeground, muted, mutedForeground, accent, accentForeground, destructive, border, input, ring, tierra, tierraForeground, arena, arenaForeground} (cada uno un hex `#rrggbb` o `#rrggbbaa`, validado por regex, elegido con el selector de color `plugin::color-picker.color`; `light` se aplica en `:root`, `dark` bajo la clase `.dark`). Equivalencias: `radius` none=0, small=0.25rem, medium=0.625rem, large=1rem, full=pill; `headerSize` compact=3rem/3.5rem/4rem, standard=3.5rem/4rem/5rem, tall=4rem/5rem/6rem (movil/640px/1024px) — la tabla exacta la define el frontend. `shared.nav-link` {label, path, fragment, kind: `link`|`tours-menu`}: `tours-menu` marca el item del header cuyo desplegable el frontend construye con destinos y tours. `shared.*`: `feature` {icon, title, body}, `stop` {image, imageUrl, title, body, expandedBody}, `video` {poster, posterUrl, webm, webmUrl, mp4, mp4Url}, `list-item` {text}, `faq` {question, answer}.

Validaciones al guardar: `site-setting.whatsapp` 8 a 15 digitos, `ruc` 11 digitos y `phone` solo digitos, espacios, `+`, `()` y `-`; los tres aceptan tambien la `X` porque el seed trae datos de marcador (`519XXXXXXXXX`, `XXXXXXXXXXX`) y una base nueva no se sembraria con un patron mas estricto (cuando el dueño ponga los datos reales, la `X` deja de usarse). `theme-setting.introRestScale` 0.1 a 1 e `introFailsafeMs` 1000 a 30000. `media-slot.key` es unica. `booking-setting`: `adultsMin <= adultsDefault <= peopleMax` y `adultsMin + childrenMin <= peopleMax`.

Un medio subido (`image`, `poster`, ...) tiene prioridad sobre su campo `*Url`; las rutas relativas (`/uploads/...`) se resuelven con `STRAPI_PUBLIC_URL` en el frontend.

## Claves de texto

`translation.key` es la misma clave i18n que usa el frontend (`nav.blog`, `footer.terms`, ...) y sobrescribe los JSON del frontend. `translation.page`/`section`/`label`/`note`/`kind` solo organizan el admin. Los textos de reserva, pago, Mi reserva, reclamos y renuncia solo son `translation` para las claves que decide `docs/TEXTOS-EDITABLES.md` de la web (18 de 178); el resto sigue en el código. Un texto sin los `{marcadores}` de su original se rechaza al guardar. Los textos de tours y destinos viajan en sus propios campos (no hay `translation` para `nav.<tour>`, `nav.<tour>Desc`, `footer.<destino>*`, `pages.<destino>Lead`, `tour.meetingIca`, `tours.*`); el frontend los registra como `cms.tours.<slug>.<campo>` y `cms.destinations.<slug>.<campo>`. Los `media-slot` usados: `home.hero`, `blog.hero`, `products.hero`, `tours.banner`, `tours.closer`, `contact.band`, `about.trio`, `about.archive.1..12`, `about.video`, `footer.stamp.mincetur`, `footer.stamp.complaints`.

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

El frontend renderiza todas sus rutas por peticion y lee el CMS con una cache de servidor corta (`STRAPI_CACHE_TTL_MS`, 30 s por defecto): lo publicado se ve en menos de ese tiempo mas los 10 s que la web guarda cada pagina publica en memoria (`PAGE_CACHE_TTL_MS`), unos 40 s en total, sin webhook ni reconstruccion. Si el CMS no responde, el frontend sirve la ultima respuesta buena y, si no hay, sus valores por defecto.

## Cambios que requiere el mapper de `desertica-web`

Para esta ola: leer `availabilityMonths` (ya lo hace) y dejar de leer `depositRate` cuando el flujo legado desaparezca; el deposito sale del API. Todo lo siguiente es nuevo, aditivo y vacio por defecto (`null` / `[]`); el frontend actual no se rompe si lo ignora. El mapper (`src/app/core/cms/`) lo incorporara en otra sesion.

Campos nuevos de `tour`:

| Campo | Tipo | Localizado | Populate | Notas |
| --- | --- | --- | --- | --- |
| `waiverBody` | richtext (Markdown) | si | ninguno (campo plano) | texto del descargo de responsabilidad que firma cada pasajero; `null` = el tour no define uno |
| `latitude` | decimal (-90..90) | no | ninguno | latitud del punto de encuentro; `null` si no esta |
| `longitude` | decimal (-180..180) | no | ninguno | longitud del punto de encuentro; `null` si no esta |
| `meetingPointUrl` | string | no | ninguno | enlace de mapa del punto de encuentro |
| `faqs[]` | componente repetible `shared.faq` {`question`, `answer`} | si | `populate[faqs]=true` | para la ficha y para datos estructurados (`FAQPage`) |

`meeting` sigue siendo el texto del punto de encuentro. Los campos planos nuevos se devuelven sin populate (con `fields[]` explicito hay que listarlos); solo `faqs` necesita `populate[faqs]=true` (el componente no contiene medios).

Campo nuevo de `booking-setting` (single type, no localizado, sin populate; aparece en `/api/booking-setting?locale=`):

| Campo | Tipo | Notas |
| --- | --- | --- |
| `availabilityMonths` | entero 1..12, por defecto 3 | cuantos meses de calendario muestra la web. Las bases nuevas lo traen en 3; en una base existente puede venir `null` hasta que alguien guarde `Sitio — Reglas de reserva`, y la web usa 3. El mapper actual ya lo lee (`booking-defaults.ts` lo limita a 1..12) |

`booking-setting.depositRate` esta **obsoleto**: ignorado por el motor de reservas nuevo; se retira cuando la web deje de leerlo. El deposito lo decide el API (`Setting.depositPercent`). No se borra ni se renombra. Hoy lo leen en `desertica-web`: `src/app/core/cms/cms-mapper.ts` (`mapBooking`), `booking-defaults.ts` (`withBookingDefaults`/`DEFAULT_BOOKING`) y `src/app/features/tours/detail/tour-book.ts` (`TOUR_DEPOSIT_RATE`, `tourDuePrice`, formulario de reserva legado). El flujo nuevo (`booking-panel`, `checkout*`) usa `depositCents` del API y no lo lee.

Paginas nuevas (colección `pages`, mismo populate `heroImage`): `cancellation` y `cookies` (ver abajo). No hay cambios en el resto de endpoints.

## Documentos legales y su slug

El API (`desertica-api`) guarda un snapshot del texto de cada version al publicarla. El slug de `page` que se debe leer por tipo de documento:

| Tipo de documento | Slug de `page` | Origen |
| --- | --- | --- |
| `TERMS` | `terms` | seed, en borrador |
| `PRIVACY` | `privacy` | seed, en borrador |
| `CANCELLATION` | `cancellation` | borrador vacio creado al arrancar |
| `COOKIES` | `cookies` | borrador vacio creado al arrancar |
| `CONDUCT` | `conduct` | seed, en borrador |

Otras paginas existentes: `complaints` y `legal-mincetur` (tambien sembradas en borrador), `blog` y `products` (hubs, sembradas publicadas) (el slug real es con guion, no `legal/mincetur`). El texto va en `body` (Markdown) y es localizado (`en`, `es`); el snapshot debe leerse con `?locale=` y `status=published`.

`cancellation` y `cookies` no estan en `seed/catalog.json` (generado, no se edita a mano). Al arrancar, `ensureExtraPages` en `src/index.ts` crea ambas, solo una vez por base de datos (marca en el store `plugin_desertica_extra-pages`), con titulo en `en`/`es`, cuerpo vacio y **en borrador**: no aparecen en la API publica hasta que alguien escriba el texto y pulse `Publish` en cada idioma. Si se borran a proposito no se recrean. Para crearlas a mano: `Páginas — Página` > `Create new entry`, slug `cancellation` o `cookies`, titulo y cuerpo en `en` y `es`, `Publish`. Si el slug no esta publicado el API debe tratarlo como "documento sin texto" y no publicar una version vacia.

## Descargo de los tours (`waiverBody`)

Cada cambio **publicado** del `waiverBody` genera una version nueva en el API (que guarda el snapshot) y los pasajeros firman el texto vigente al reservar. El CMS no versiona: guardar un borrador no cambia nada para los pasajeros. La ayuda del campo en el admin lo explica.

## Paginas legales en el admin

Las siete paginas legales (`terms`, `privacy`, `cancellation`, `cookies`, `conduct`, `complaints`, `legal-mincetur`) son del mismo tipo `page` y comparten campos (`title`, `lead`, `body`, SEO). En `Páginas — Página` la lista va ordenada por `slug` (columnas `title`, `slug`, `updatedAt`, mas el estado de Strapi); comparte lista con las paginas hub `blog` y `products`. No hay cambios de contrato.

Las siete se siembran **en borrador y con el texto del seed sin revisar**: en una base nueva no aparecen en la API publica (ni en la web) hasta que alguien las redacte y pulse `Publish` en `en` y en `es`. Checklist de lanzamiento en `docs/OPERACION.md` (seccion 7). Una base que ya existia conserva lo que tenia publicado.

Textos de ejemplo NO LEGALES para desarrollo: `docs/DEV-LEGAL-SAMPLES.md`.

## `reservation` es legado

La coleccion `reservation` (y `POST /api/reservations`) sera reemplazada por `desertica-api` (dinero, cupos y reservas) cuando se active el checkout nuevo. Hasta entonces se mantiene tal cual y **sus permisos publicos (`create`) no se retiran**: el frontend actual la sigue usando. Al activar el checkout nuevo se retirara el permiso y la coleccion pasara a solo lectura/archivo en un cambio aparte, coordinado con `desertica-web`. `contact-message` no cambia.

## Inconsistencia `translation.page` vs `media-slot.page`

`media-slot.page` tenia el valor `brand` y `translation.page` no. Se anadio `brand` al enum de `translation.page` (cambio aditivo: no altera filas existentes ni el contrato: `translation.page` solo organiza el admin). Ambos enums quedan iguales.

Webhook opcional de publicacion para invalidar caches: ver `docs/WEBHOOKS.md`.
