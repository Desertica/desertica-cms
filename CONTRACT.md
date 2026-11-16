# Contrato con el frontend (`desertica-web`)

El frontend Angular lee de este CMS en el servidor (SSR/prerender) y reenvia los formularios. Cambiar un nombre de campo de abajo rompe el mapper del frontend (`src/app/core/cms/cms-mapper.ts`), asi que cualquier cambio de esquema debe coordinarse con ese repo.

## Endpoints usados

Todos publicos (rol Public), lectura con `?locale=en|es` y paginacion `pagination[pageSize]=100`.

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/destinations`, `/api/tours` | catalogo, orden por `order:asc` |
| GET | `/api/translations` | textos de interfaz, orden `key:asc` |
| GET | `/api/media-slots`, `/api/pages`, `/api/blog-posts`, `/api/products` | imagenes, paginas legales/hubs, blog, productos |
| GET | `/api/site-setting` | contacto, redes, marca, imagen para compartir |
| GET | `/api/theme-setting`, `/api/booking-setting`, `/api/form-setting`, `/api/navigation` | tema, valores iniciales y garantias de la reserva, limites de formularios, menus (`booking-setting` y `navigation` son localizados: se leen con `?locale=`; `site-setting`, `theme-setting` y `form-setting` no) |

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
/api/site-setting?populate[shareImage]=true&populate[placeholderImage]=true
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
| `tour` | `slug`, `order`, `destination`, `featured`, `imageFocus` (`center`/`top`/`bottom`/`left`/`right`, por defecto `center`: parte de la foto que queda visible al recortarla en la tarjeta), `image`, `imageUrl`, `gallery`, `galleryUrls`, `itineraryFile`, `itineraryFileUrl` | `title`, `seoTitle`, `seoDescription`, `assurances[]` (opcional, sustituye las globales), `description` (resumen para tarjetas), `body` (descripción completa: párrafos separados por línea en blanco; la ficha muestra el primero como entrada y el resto debajo, y el desplegable los repite), `lead`, `termsSummary`, `paragraphs[]`, `expandedParagraphs[]`, `practices[]`, `itinerary[]`, `videos[]`, `included[]`, `excluded[]`, `pack[]`, `notes[]`, `waiverBody` (Markdown), `faqs[]` (`shared.faq`) |
| `translation` | `key`, `group`, `page`, `section`, `label`, `note`, `kind` (`short`/`long`) | `value` |
| `media-slot` | `key`, `page`, `section`, `description`, `image`, `imageUrl`, `video`, `videoUrl`, `videoWebmUrl`, `poster`, `posterUrl` | `alt` |
| `page` | `slug`, `heroImage`, `heroImageUrl` | `title`, `lead`, `body` (Markdown), `seoTitle`, `seoDescription` |
| `blog-post` | `slug`, `publishedDate`, `cover`, `coverUrl`, `featured` | `title`, `category`, `excerpt`, `content` (Markdown), `seoDescription` |
| `product` | `slug`, `order`, `price`, `featured`, `image`, `imageUrl`, `gallery` | `title`, `description`, `details` (Markdown) |
| `site-setting` (single) | `email`, `phone`, `phone2` (telefono secundario, opcional, mismo formato; reemplaza a `whatsapp2`), `whatsapp` (solo digitos), `whatsapp2` (**obsoleto**: oculto y sin uso; su valor se copio una vez a `phone2`), `instagram`, `facebook`, `tiktok`, `youtube`, `linkedin`, `google`, `tripadvisor`, `showInstagram`, `showFacebook`, `showTiktok`, `showYoutube`, `showLinkedin`, `showGoogle`, `showTripadvisor` (booleanos, `false` por defecto: la web muestra una red solo si su interruptor esta activo Y la URL no esta vacia), `brandName`, `legalYear`, `shareImage`, `shareImageUrl`, `placeholderImage` (imagen de relleno cuando una foto falta o no carga; se siembra una gris con icono de foto) | - |
| `theme-setting` (single) | `light`, `dark` (`theme.palette`), `fontSans`, `fontHeading` (enum: `radio-canada`, `inter`, `poppins`, `montserrat`, `dm-sans`, `playfair-display`, `lora`, `merriweather`, `system`), `radius` (enum: `none`, `small`, `medium`, `large`, `full`), `headerSize` (enum: `compact`, `standard`, `tall`), `introEnabled`, `introAccent` (hex), `introRestScale`, `introFailsafeMs` | - |
| `booking-setting` (single) | `adultsDefault`, `childrenDefault` (cuantos aparecen marcados al abrir el calendario), `currencyCode` | `assurances[]` (`shared.feature`) |
| `form-setting` (single) | `nameMin`, `nameMax`, `emailMax`, `messageMax` | - |
| `navigation` (single) | - | `headerLinks[]`, `footerBrandLinks[]`, `footerLegalLinks[]` (`shared.nav-link`), `planTripLabel`, `planTripPath` |

Componentes: `theme.palette` {background, foreground, card, cardForeground, popover, popoverForeground, primary, primaryForeground, secondary, secondaryForeground, muted, mutedForeground, accent, accentForeground, destructive, border, input, ring, tierra, tierraForeground, arena, arenaForeground} (cada uno un hex `#rrggbb` o `#rrggbbaa`, validado por regex, elegido con el selector de color `plugin::color-picker.color`; `light` se aplica en `:root`, `dark` bajo la clase `.dark`). Equivalencias: `radius` none=0, small=0.25rem, medium=0.625rem, large=1rem, full=pill; `headerSize` compact=3rem/3.5rem/4rem, standard=3.5rem/4rem/5rem, tall=4rem/5rem/6rem (movil/640px/1024px) — la tabla exacta la define el frontend. `shared.nav-link` {label, path, fragment, kind: `link`|`tours-menu`}: `tours-menu` marca el item del header cuyo desplegable el frontend construye con destinos y tours. `shared.*`: `feature` {icon, title, body}, `stop` {image, imageUrl, title, body, expandedBody}, `video` {poster, posterUrl, webm, webmUrl, mp4, mp4Url}, `list-item` {text}, `faq` {question, answer}.

Validaciones al guardar: `site-setting.whatsapp` 8 a 15 digitos y `phone` solo digitos, espacios, `+`, `()` y `-`; los dos aceptan tambien la `X` porque el seed trae datos de marcador (`519XXXXXXXXX`) y una base nueva no se sembraria con un patron mas estricto (cuando el dueño ponga los datos reales, la `X` deja de usarse). `theme-setting.introRestScale` 0.1 a 1 e `introFailsafeMs` 1000 a 30000. `media-slot.key` es unica.

Un medio subido (`image`, `poster`, ...) tiene prioridad sobre su campo `*Url`; las rutas relativas (`/uploads/...`) se resuelven con `STRAPI_PUBLIC_URL` en el frontend.

## Claves de texto

`translation.key` es la misma clave i18n que usa el frontend (`nav.blog`, `footer.terms`, ...) y sobrescribe los JSON del frontend. `translation.page`/`section`/`label`/`note`/`kind` y `sortKey` (translation y media-slot; calculado, oculto) solo organizan el admin; la web usa `key` y `value`. Los textos de reserva, pago, Mi reserva, reclamos y renuncia solo son `translation` para las claves que decide `docs/TEXTOS-EDITABLES.md` de la web (18 de 178); el resto sigue en el código. El seed trae 229 textos y `syncNewTranslations` añade al arrancar los que falten. Un texto sin los `{marcadores}` de su original se rechaza al guardar. Los textos de tours y destinos viajan en sus propios campos (no hay `translation` para `nav.<tour>`, `nav.<tour>Desc`, `footer.<destino>*`, `pages.<destino>Lead`, `tour.meetingIca`, `tours.*`); el frontend los registra como `cms.tours.<slug>.<campo>` y `cms.destinations.<slug>.<campo>`. Los `media-slot` usados: `home.hero`, `blog.hero`, `products.hero`, `tours.banner`, `tours.closer`, `contact.band`, `about.trio`, `about.archive.1..12`, `about.video`, `footer.stamp.mincetur`, `footer.stamp.complaints`.

## Variables que el frontend necesita

En el servidor Angular (no en el navegador):

| Variable | Descripcion |
| --- | --- |
| `STRAPI_URL` | URL base del CMS; vacia = el frontend usa su catalogo estatico |
| `STRAPI_PUBLIC_URL` | URL desde la que el navegador carga los medios (por defecto `STRAPI_URL`) |
| `STRAPI_API_TOKEN` | opcional, token de solo lectura si se quita el permiso publico |
| `STRAPI_CACHE_TTL_MS` | cache del servidor, por defecto 30000 |
| `FORMS_PROXY_SECRET` | mismo valor aqui y en el frontend: solo firma la vista previa de borradores (opcional) |

En el CMS: `CLIENT_URLS` (CORS) debe incluir el origen del frontend, y `PUBLIC_URL` la URL publica del CMS.

## Publicacion de cambios

El frontend renderiza todas sus rutas por peticion y lee el CMS con una cache de servidor corta (`STRAPI_CACHE_TTL_MS`, 30 s por defecto): lo publicado se ve en menos de ese tiempo mas los 10 s que la web guarda cada pagina publica en memoria (`PAGE_CACHE_TTL_MS`), unos 40 s en total, sin webhook ni reconstruccion. Si el CMS no responde, el frontend sirve la ultima respuesta buena y, si no hay, sus valores por defecto.

## Cambios que requiere el mapper de `desertica-web`

Todo lo siguiente es nuevo, aditivo y vacio por defecto (`null` / `[]`); el frontend actual no se rompe si lo ignora. El mapper (`src/app/core/cms/`) lo incorporara en otra sesion.

Campos nuevos de `tour`:

| Campo | Tipo | Localizado | Populate | Notas |
| --- | --- | --- | --- | --- |
| `waiverBody` | richtext (Markdown) | si | ninguno (campo plano) | texto del descargo de responsabilidad que firma cada pasajero; `null` = el tour no define uno |
| `faqs[]` | componente repetible `shared.faq` {`question`, `answer`} | si | `populate[faqs]=true` | para la ficha y para datos estructurados (`FAQPage`) |

Los campos planos nuevos se devuelven sin populate (con `fields[]` explicito hay que listarlos); solo `faqs` necesita `populate[faqs]=true` (el componente no contiene medios).

## Datos que pasaron al backoffice

Regla: cada dato tiene un solo dueño (`desertica-api`, `docs/CMS-VS-BACKOFFICE.md`). Lo que cobra, vende cupo o es fiscal vive en el backoffice (API); el CMS guarda solo contenido. Estos campos **ya no existen en el CMS** y la web los lee del API:

| Tipo | Campos retirados | Dueño ahora |
| --- | --- | --- |
| `tour` | `priceFrom`, `pricePen`, `durationHours`, `format`, `languages`, `meeting`, `meetingPointUrl`, `latitude`, `longitude` | backoffice: precios y datos operativos de cada tour |
| `booking-setting` | `depositRate`, `availabilityMonths`, `adultsMin`, `childrenMin`, `peopleMax` | backoffice: reglas de reserva |
| `site-setting` | `legalName`, `ruc` | backoffice: identidad fiscal (`/public/company`) |

En `booking-setting` quedan `adultsDefault`, `childrenDefault`, `currencyCode` y `assurances[]`, que solo deciden lo que se muestra. `seed/catalog.json` puede traer todavia las claves retiradas: la siembra las ignora.

### Orden de despliegue

Al quitar un atributo, Strapi **borra su columna al arrancar** y los valores se pierden. Por eso esta version del CMS se despliega solo DESPUES de:

1. desplegar la version del API que importa esos valores;
2. ejecutar una vez `POST /tour-refs/sync`;
3. cargar en el backoffice el RUC, la razon social y las reglas de reserva.

## Documentos legales

Terminos, privacidad, cancelacion, cookies y conducta (`TERMS`, `PRIVACY`, `CANCELLATION`, `COOKIES`, `CONDUCT`) **no viven en el CMS**: se escriben, versionan y publican en el backoffice (`desertica-api`, `LegalDocument`) y la web los lee del API. Al arrancar, `removeMovedLegalPages` en `src/index.ts` borra sus paginas (`terms`, `privacy`, `cancellation`, `cookies`, `conduct`), una sola vez por base de datos (marca en el store `plugin_desertica_legal-pages-removed`).

Siguen en el CMS `complaints` y `legal-mincetur` (sembradas en borrador) y los hubs `blog` y `products` (sembrados publicados). El texto va en `body` (Markdown) y es localizado (`en`, `es`).

## Descargo de los tours (`waiverBody`)

Cada cambio **publicado** del `waiverBody` genera una version nueva en el API (que guarda el snapshot) y los pasajeros firman el texto vigente al reservar. El CMS no versiona: guardar un borrador no cambia nada para los pasajeros. La ayuda del campo en el admin lo explica.

## Paginas legales en el admin

`complaints` y `legal-mincetur` son del tipo `page` (`title`, `lead`, `body`, SEO) y comparten lista con `blog` y `products`. Se siembran **en borrador**: no aparecen en la web hasta que alguien las redacte y pulse `Publish` en `en` y en `es`. Checklist en `docs/OPERACION.md` (seccion 7).

Descargo de ejemplo NO LEGAL para desarrollo: `docs/DEV-LEGAL-SAMPLES.md`.

## Inconsistencia `translation.page` vs `media-slot.page`

`media-slot.page` tenia el valor `brand` y `translation.page` no. Se anadio `brand` al enum de `translation.page` (cambio aditivo: no altera filas existentes ni el contrato: `translation.page` solo organiza el admin). Ambos enums quedan iguales.

Webhook opcional de publicacion para invalidar caches: ver `docs/WEBHOOKS.md`.

## Cambios del editor (sin romper la API)

- `slug` de `tour`, `destination`, `blog-post` y `product` ya no es `required` en el esquema (la API sigue devolviéndolo): se genera del título al crear y el equipo no puede cambiarlo.
- `shared.feature.icon` es una enumeración: `lucideUsers`, `lucideLanguages`, `lucideCar`, `lucideWind`, `lucideCalendar`, `lucideClock`, `lucideCircleDollarSign`, `lucideMapPin`, `lucideCamera`, `lucideSun`, `lucideMoon`, `lucideShieldCheck`, `lucideHeart`, `lucideStar`, `lucideMountain`, `lucideWaves`, `lucideDroplets`, `lucideBackpack`, `lucideGlasses`, `lucideShirt`, `lucideUtensils`, `lucideBus`, `lucideCheck`, `lucideInfo`, `lucideCompass`, `lucideTent`, `lucideBinoculars`, `lucideBadgeCheck`. La web debe registrar todos.
- `imageUrl`, `galleryUrls`, `itineraryFileUrl` y los demás `*Url` de imagen siguen en la API pero ya no se editan en el panel.
- La vista previa se firma con `FORMS_PROXY_SECRET` (antes `PREVIEW_SECRET`); el esquema `<exp>:<ruta>` no cambia.
