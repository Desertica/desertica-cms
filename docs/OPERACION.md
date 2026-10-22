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
| `FORMS_PROXY_SECRET` | el mismo valor que en la web | Ahora es **obligatorio**: sin la cabecera `X-Forms-Secret` el CMS rechaza los formularios (403) |
| `SEED_ON_EMPTY` | `false` después del primer arranque | |
| `SEED_SAMPLE_TOUR` | `true` solo en staging | Crea el tour `[EJEMPLO]` una vez |
| `DEEPL_API_KEY` | clave de DeepL (gratis termina en `:fx`) | Activa el panel de traducción automática |
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
- **Socios:** *Settings > Administration panel > Users > Invite new user* con el rol **Editor**. El rol ya viene sin acceso a *Bandeja* (mensajes de clientes). Si no hay correo configurado, Strapi muestra el enlace de registro para que se lo envíes. Cada persona elige *Español* en su perfil.

## 7. De staging a producción (al lanzar)

Los socios cargan el contenido en staging. Al lanzar, hay dos caminos; ensáyalo antes con una copia:

- `npx strapi export --no-encrypt -f staging` en staging y `npx strapi import -f staging.tar.gz` en producción (contenido y archivos). No lo he probado en este proyecto.
- O restaurar una copia de Postgres y apuntar producción al mismo bucket de imágenes.

Los secretos de producción son **distintos** de los de staging (`ENCRYPTION_KEY`, `JWT_SECRET`...): al copiar datos entre entornos, revisa que los tokens de API y de transferencia se vuelvan a crear en producción.
