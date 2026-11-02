# Operación de staging (Coolify + Cloudflare)

Pasos que necesitan tus cuentas. El código ya está preparado; aquí está qué configurar y cómo comprobarlo. Las pantallas de Coolify y Cloudflare cambian: si un nombre no coincide, busca el equivalente y no cambies el valor.

## 1. Variables de cada aplicación (Coolify > app > Environment Variables)

**CMS (`desertica-cms:staging`)**

| Variable | Valor | Nota |
| --- | --- | --- |
| `NODE_ENV` | ya viene en la imagen | Con secretos `changeMe` el CMS no arranca |
| `PUBLIC_URL`, `CLIENT_URLS`, `PROXY=true` | `https://cms-stg.desertica.pe`, `https://stg.desertica.pe`, `true` | |
| `DATABASE_CLIENT`, `DATABASE_URL`, `DATABASE_SSL` | `postgres`, URL interna, `false` | |
| `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY`, `JWT_SECRET` | valores aleatorios distintos por entorno | |
| `FORMS_PROXY_SECRET` | el mismo valor que en la web | **Obligatorio en producción** (si falta, el CMS no arranca): sin la cabecera `X-Forms-Secret` el CMS rechaza los formularios (403). También firma la vista previa del editor (la abre en el primer `CLIENT_URLS`; sin esa variable o sin el secreto no hay botón) |
| `SEED_ON_EMPTY` | `false` después del primer arranque | |
| `SEED_SAMPLE_TOUR` | `true` solo en staging | Crea una vez el tour de ejemplo (`[EJEMPLO] Tour completo` en español, `[EXAMPLE] Complete tour` en inglés), publicado y con precio: **nunca en producción** |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | datos del SMTP | Cada reserva o mensaje nuevo envía un correo corto (tour, fecha, personas, nombre; sin teléfono ni correo del cliente) al correo de *Datos de la empresa*, desde `SMTP_USER`. Sin `SMTP_HOST` no se envía y el log lo dice al arrancar. Si el SMTP falla, solo queda un error en el log: el formulario responde igual. `SMTP_PORT` (587) y `SMTP_SECURE` (false) solo si el proveedor lo pide |
| `DEEPL_API_KEY` | clave de DeepL (gratis termina en `:fx`) | Activa el panel de traducción automática y el borrador en inglés al publicar en español (ver *Qué hace cada menú*) |
| `UPLOAD_PROVIDER` y `S3_*` | ver la sección 3 | |

**Web (`desertica-web:staging`)**

| Variable | Valor | Nota |
| --- | --- | --- |
| `NG_ALLOWED_HOSTS` | `stg.desertica.pe,localhost` | |
| `SITE_URL` | `https://stg.desertica.pe` | Sin ella el canónico usa el `Host` de la petición |
| `STRAPI_URL`, `STRAPI_PUBLIC_URL` | `https://cms-stg.desertica.pe` | |
| `FORMS_PROXY_SECRET` | igual que el CMS | |
| `TRUST_PROXY` | `1` (`2` cuando Cloudflare esté delante) | **No uses `true`**: cualquiera elegiría su IP y saltaría los límites |
| `ROBOTS_DISALLOW_ALL` | `true` en staging | |
| `IMAGE_HOSTS` | host de las imágenes si no es el del CMS (ver sección 3) | |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | de la sección 6 | Sin ellas los formularios dependen solo del límite de envíos |
| `BOOKING_ENGINE_ENABLED` | `false` hasta desplegar el API | |

**Secretos fuera de la construcción:** en cada variable secreta (los seis secretos de Strapi y `FORMS_PROXY_SECRET`) abre el engranaje y **desmarca *Buildtime***. Así no quedan como argumentos de la construcción de la imagen.

## 2. Después de desplegar: comprobaciones

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://cms-stg.desertica.pe/_health            # 204
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://cms-stg.desertica.pe/api/auth/local/register -H 'content-type: application/json' -d '{}'   # 403
curl -s "https://cms-stg.desertica.pe/api/pages?status=draft" | grep -c '"publishedAt":null'   # 0
curl -sI https://stg.desertica.pe/ | grep -i '^location'                                     # /en/ o /es/ según tu idioma
curl -sI https://stg.desertica.pe/es/no-existe | head -1                                     # HTTP/2 404
```

Envía un mensaje desde `/es/contact` y comprueba que aparece en *Bandeja*. Si da error, el `FORMS_PROXY_SECRET` no coincide en las dos aplicaciones.

## 3. Imágenes en Cloudflare R2

1. Cloudflare > R2 > **Create bucket** `desertica-media-stg` (privado).
2. R2 > *Manage API tokens* > token con permiso **Object Read & Write limitado a ese bucket**. Guarda *Access Key ID* y *Secret*.
3. En el bucket > *Settings* > **Custom Domains**: `media-stg.desertica.pe`. Así las imágenes salen por tu dominio y con la caché de Cloudflare.
4. CMS, variables:

```
UPLOAD_PROVIDER=aws-s3
S3_BUCKET=desertica-media-stg
S3_REGION=auto
S3_ENDPOINT=https://<ID-DE-CUENTA>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_URL=https://media-stg.desertica.pe
S3_FORCE_PATH_STYLE=true
```

5. Web: `IMAGE_HOSTS=media-stg.desertica.pe`.
6. Las imágenes que ya estén en el volumen del servidor siguen en `/uploads`; las nuevas van a R2. Para moverlas, vuelve a subirlas desde la biblioteca de medios. Hazlo **antes** de que los socios suban muchas.

## 4. Copias de seguridad de Postgres (Coolify)

1. Coolify > *Settings* > **S3 Storages** > añade R2 como almacenamiento compatible con S3 (endpoint, bucket `desertica-backups`, clave con permiso solo sobre ese bucket) y pulsa *Validate*.
2. Base de datos `cms-stg-db` > **Backups** > *Add*: frecuencia diaria (`0 3 * * *`), retención 14 días, destino S3.
3. **Prueba una restauración** (una copia sin probar no cuenta): descarga el último archivo y restáuralo en una base de prueba:

```bash
createdb desertica_restore_test
pg_restore --no-owner -d desertica_restore_test cms-stg-db-AAAA-MM-DD.dmp
psql desertica_restore_test -c "select count(*) from tours;"   # deben salir los tours
dropdb desertica_restore_test
```

4. Con R2 como almacenamiento de imágenes, las fotos ya no viven en el servidor. R2 no es una copia de seguridad por sí mismo: borrar un archivo lo borra. Si quieres red de seguridad, copia el bucket a otro con `rclone sync` una vez por semana (no probado aquí).

## 5. Proteger `/admin` con Cloudflare Access

Requiere el proxy de Cloudflare activo (nube naranja) en `cms-stg.desertica.pe`.

1. Cloudflare > *Zero Trust* > *Access* > *Applications* > **Add application** > Self-hosted, dominio `cms-stg.desertica.pe` (todo el host).
2. Política **Allow**: solo los correos de la empresa y de los socios.
3. Dos políticas **Bypass** para que la web y los visitantes sigan funcionando: rutas `/api/*`, `/uploads/*` y `/_health`.
4. Prueba: abre `/admin` en una ventana privada (pide correo) y `https://stg.desertica.pe` (sigue mostrando los tours).

Según recuerdo, el plan gratuito cubre hasta 50 usuarios; compruébalo en Cloudflare. Strapi gratuito no trae autenticación en dos pasos, así que usa contraseñas largas y únicas.

## 6. Turnstile, DeepL y usuarios

- **Turnstile:** Cloudflare > Turnstile > *Add widget* para `stg.desertica.pe`. La *site key* va en `TURNSTILE_SITE_KEY` y la *secret key* en `TURNSTILE_SECRET_KEY` de la web.
- **DeepL:** cuenta en deepl.com/pro-api (el plan gratuito sirve para empezar); la clave va en `DEEPL_API_KEY` del CMS.
- **Socios:** *Settings > Administration panel > Users > Invite new user* con el rol **Editor**. El Editor edita y publica tours, destinos, páginas, blog, tienda, textos y medios, en `en` y `es`; no borra tours, destinos ni páginas (solo el Super Admin), ni entra a *Bandeja* (mensajes de clientes) ni a *Sitio* (datos de la empresa, colores, reglas de reserva, formularios, menús). Los permisos se fijan una sola vez al arrancar; si los cambias en *Settings > Roles* se conservan. Si no hay correo configurado, Strapi muestra el enlace de registro para que se lo envíes. Cada persona elige *Español* en su perfil.

## 7. De staging a producción (al lanzar)

Los socios cargan el contenido en staging. Al lanzar, hay dos caminos; ensáyalo antes con una copia:

- `npx strapi export --no-encrypt -f staging` en staging y `npx strapi import -f staging.tar.gz` en producción (contenido y archivos). No lo he probado en este proyecto.
- O restaurar una copia de Postgres y apuntar producción al mismo bucket de imágenes.

**Checklist de lanzamiento: páginas legales.** En una base nueva las siete (`terms`, `privacy`, `cancellation`, `cookies`, `conduct`, `complaints`, `legal-mincetur`) están en **borrador** y la web no las muestra hasta publicarlas. Antes de lanzar, en *Páginas — Página*:

1. Redacta el texto definitivo (revisado por el abogado) de las siete, en **inglés y español**.
2. Pulsa `Publish` en cada una, en cada idioma (14 publicaciones). Solo `blog` y `products` salen publicadas del seed.
3. Comprueba sin credenciales: `curl -s "https://<cms>/api/pages?locale=es&filters[slug][$eq]=terms"` devuelve la página con `body`, y lo mismo para las otras seis y para `en`.

Los secretos de producción son **distintos** de los de staging (`ENCRYPTION_KEY`, `JWT_SECRET`...): al copiar datos entre entornos, revisa que los tokens de API y de transferencia se vuelvan a crear en producción.

## 8. Textos nuevos en una base que ya existe

El seed solo corre con la base vacía. Cuando la web gana textos editables (por ejemplo los del flujo de reserva, pago, Libro de Reclamaciones y renuncia, ver `docs/TEXTOS-EDITABLES.md` en la web), no hay que reseedear:

1. Despliega el CMS con el `seed/catalog.json` nuevo (regenerado con `npm run cms:seed` en la web).
2. Al arrancar, `syncNewTranslations` crea como filas nuevas en *Textos* solo las claves que la base aún no tiene. No toca filas existentes (las ediciones de los socios se conservan) y cada clave se ofrece una sola vez: si un socio borra una, no vuelve.
3. Comprueba en los logs `[seed] N new translation(s) added` y que `GET /api/translations?filters[key][$eq]=booking.lead` devuelve la fila.
4. Hasta que alguien las edite, la web muestra el mismo texto que el código: añadirlas no cambia nada visible.

Si cambias el texto original en el código de una clave que ya existe en la base, la fila del CMS sigue mandando: edítala desde *Textos*. El CMS no deja guardar un texto al que le falte un marcador entre llaves (`{tour}`, `{date}`...) que tenía el texto original del seed; límite: compara con el seed, así que un marcador añadido después en el código no se protege hasta regenerarlo.

## Cosas que conviene saber

- Al arrancar, el rol Public queda **exactamente** con los permisos que declara el código: un permiso que alguien añada a Public desde el panel se revierte en el siguiente arranque. Es a propósito (ver CLAUDE.md).
- La primera vez que corre la sincronización de textos en una base con datos, repone una vez, como filas nuevas, las del seed que un editor hubiera borrado antes. Después ya no vuelven.
- La traducción automática del panel reemplaza el borrador del otro idioma: pide confirmación y lo publicado no cambia. Al publicar en español un tour, destino, artículo o producto que aún no tiene versión en inglés (y con `DEEPL_API_KEY`), el CMS crea solo el borrador en inglés; nunca lo publica ni pisa uno que ya exista. Si DeepL falla, solo queda un aviso en el log.
- CKEditor 5 trae `ckeditor5` con licencia GPL-2+ (o comercial). En un panel interno que no se distribuye no suele ser un problema, pero revísalo con el abogado. Antes de usarlo con los textos legales, abre y guarda cada uno en staging y comprueba que el Markdown no cambia: cada publicación de `waiverBody` crea una versión nueva en el API.

## Qué ve el equipo en el panel

- **Inicio:** widgets *Bandeja* (reservas pendientes y mensajes sin atender), *Páginas legales por publicar* (de las 7, las que no están publicadas en cada idioma) y *Tours sin foto o sin descargo*. Cada uno solo aparece a quien puede leer ese contenido: el Editor no ve la Bandeja. Los datos salen de `GET /desertica/overview` (solo lectura, solo administradores). La página de inicio de Strapi 5 es personalizable: cada persona puede quitar o mover widgets con *Añadir widget*.
- **Editor del tour:** panel lateral *Antes de publicar* con foto, descripción, punto de encuentro, descargo y preguntas frecuentes. Es solo una guía: no bloquea publicar. Usa `unstable_useContentManagerContext` de Strapi (el nombre indica que la API aún puede cambiar al actualizar Strapi).
- **Vista previa:** botón *Abrir previsualización* con enlace firmado de 10 minutos; requiere que la web verifique la firma.
- **Menú de Ajustes:** `promoteEE: false` (fijo en `config/admin.ts`) quita las entradas de pago (Historial, Lanzamientos, Review Workflows, SSO, Registros de auditoría); es una opción soportada de Strapi. Lo demás ya depende del rol: el Editor solo ve Inicio, Contenido, Biblioteca de Multimedia y *Descripción general*; Content-Type Builder solo existe en `develop`. No se oculta nada más con CSS/DOM (frágil). *Marketplace* y la casilla de noticias del registro de invitados son de Strapi y no tienen opción de ocultar.
- **Pantallas de entrada:** inicio de sesión, invitación y recorrido guiado con los textos en español de `translations` en `src/admin/app.tsx`.

## Qué hace cada menú

El equipo escribe solo en español: el inglés sale en borrador al publicar (ver arriba) y se revisa antes de publicarlo.

| Menú del panel | Para qué sirve | Notas |
| --- | --- | --- |
| Catálogo — Tour | Tours: precio, duración, fotos, itinerario, qué incluye, preguntas, descargo | La dirección web (slug) se crea sola con el nombre y no se puede cambiar. Galería: máximo 6 fotos. *Enfoque de la imagen* elige qué parte de la foto queda visible cuando la tarjeta la recorta; no cambia el archivo. Los iconos se eligen de una lista. Las direcciones de imagen externas y los idiomas están ocultos |
| Catálogo — Destino | Ciudades o zonas que agrupan tours | Slug automático y fijo |
| Textos — Texto de la web | Cada texto suelto de la web (botones, títulos, avisos). Lista ordenada por página; cada fila dice en qué página y sección aparece | Solo se edita *Texto que se muestra en la web*; no se pueden crear ni borrar filas ni tocar `{marcadores}` |
| Medios — Imagen o video de la web | Imágenes y videos fijos de la web (portadas, banners) | Solo se cambia el archivo y el texto alternativo |
| Páginas — Página | Textos legales y portadas de blog y tienda | Los textos legales no se traducen solos |
| Blog — Artículo / Tienda — Producto | Artículos y productos | Slug automático y fijo; la galería del producto admite 6 fotos |
| Sitio — Datos de la empresa | Contacto, redes (cada una con su interruptor «Mostrar en el sitio»; apagado no aparece en la web pero conserva la dirección), razón social, imagen al compartir, **imagen de relleno** (se muestra cuando una foto falta o no carga) y correo que recibe los avisos de reservas y mensajes | |
| Sitio — Colores y estilo | Colores, letras, esquinas y animación de entrada | |
| Sitio — Reglas de reserva | Cómo se comporta el calendario de reservas: meses visibles, mínimo/inicial/máximo de adultos y niños, moneda y garantías junto al formulario | El depósito ya no se usa aquí |
| Sitio — Formularios | Largo mínimo y máximo del nombre, correo y mensaje del **formulario de contacto** de la web. Los formularios de reserva y de reclamos tienen límites fijos | Solo puede bajar los límites fijos del sistema, no subirlos |
| Sitio — Menús | Enlaces de la barra superior y del pie | |
| Bandeja | Solicitudes de reserva y mensajes de contacto que llegan de la web | Solo el Super Admin |

Imágenes: el CMS guarda el original tal como se sube. La web lo convierte a WebP y lo reduce al vuelo (`/_img`, `src/image-proxy.ts` de `desertica-web`). Al editar un archivo en la *Biblioteca de Multimedia* se puede recortar (rectángulo con asa en las esquinas, bloqueo de proporción, medidas en píxeles, girar 90°) y fijar el punto que siempre debe verse; no hay zoom ni proporciones predefinidas (16:9, 4:3...).
