# Despliegue del CMS (Strapi 5)

Imagen publicada por CI: `ghcr.io/desertica/desertica-cms` (`latest` = main, `sha-<corto>`, `vX.Y.Z`). El contenedor escucha en el puerto 1337, corre como usuario `node` y responde `GET /_health` (204).

## Variables de entorno

| Variable | Obligatoria | Descripcion |
| --- | --- | --- |
| `APP_KEYS` | si | 4 secretos separados por coma (`openssl rand -base64 16` cuatro veces) |
| `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY`, `JWT_SECRET` | si | Un secreto distinto cada uno. Cambiar `ADMIN_JWT_SECRET`/`JWT_SECRET` cierra las sesiones; cambiar `ENCRYPTION_KEY` rompe lo cifrado (tokens de transferencia) |
| `PUBLIC_URL` | si | URL publica del CMS, `https://cms.ejemplo.com` (sin barra final). Define la URL del admin; no vuelve absolutas las URLs de los medios |
| `PROXY` | si hay proxy | `true` detras de un proxy inverso con TLS (cookies seguras del admin, IP real) |
| `CLIENT_URLS` | si | Origenes CORS, separados por coma (origen del frontend y del admin si se sirve aparte) |
| `DATABASE_CLIENT` | si | `postgres` en produccion (`sqlite` solo desarrollo) |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | si (postgres) | Conexion. Opcionales: `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_SCHEMA`, `DATABASE_POOL_MIN/MAX` |
| `FORMS_PROXY_SECRET` | si | Mismo valor que en el servidor Angular. Sin el, el limite de peticiones usa la IP del proxy (todos los visitantes comparten cupo) |
| `SEED_ON_EMPTY` | no | `true` (por defecto) siembra una base vacia. Poner `false` tras el primer arranque |
| `UPLOAD_PROVIDER` | no | `local` (por defecto, `public/uploads`) o `aws-s3` |
| `UPLOAD_MAX_FILE_SIZE_MB` | no | Limite por archivo, 200 por defecto (cuerpo HTTP y plugin upload); si hay proxy inverso, subir tambien su limite (nginx `client_max_body_size`) |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | con `aws-s3` | Bucket y credenciales (sin llaves se usa la cadena por defecto del SDK, p. ej. rol IAM) |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | R2/MinIO/Spaces | Endpoint compatible S3; `S3_FORCE_PATH_STYLE=true` para MinIO |
| `S3_PUBLIC_URL` | recomendada | URL publica del bucket o CDN, prefijo de las URLs de los medios. Se anade a la CSP |
| `S3_ROOT_PATH`, `S3_ACL` | no | Carpeta dentro del bucket; ACL (vacio si el bucket las tiene desactivadas) |
| `MEDIA_HOSTS` | no | Hosts extra permitidos por la CSP para imagenes y video |
| `HOST`, `PORT` | no | 0.0.0.0 y 1337 |

Docker Compose usa ademas `CMS_HOST_PORT` (puerto publicado, 1337) y exige `DATABASE_PASSWORD`.

## Arranque con Docker Compose

```bash
cp .env.example .env     # secretos, DATABASE_PASSWORD, PUBLIC_URL, CLIENT_URLS, FORMS_PROXY_SECRET
docker compose up -d --build
docker compose exec cms node_modules/.bin/strapi admin:create-user \
  --firstname Admin --lastname Desertica --email tu@correo --password '<clave larga>'
```

`docker-compose.yml` levanta `cms` + `postgres:16` con volumenes `pgdata` y `uploads` (`/opt/app/public/uploads`). En la primera arranque con la base vacia se siembra el catalogo. Con una imagen ya publicada: `CMS_IMAGE=ghcr.io/desertica/desertica-cms:v1.0.0 docker compose up -d --no-build`.

Sin Docker: `npm ci && npm run build && NODE_ENV=production npm run start` con las mismas variables (Node 22).

## Lista de primera puesta en marcha

1. Crear el administrador (comando de arriba o `/admin` si no hay ninguno).
2. Editar **Site - Settings**: email, telefono, WhatsApp (solo digitos), redes y datos legales (el seed trae marcadores `XXXX`). Revisar Theme, Booking rules, Forms y Navigation.
3. Subir los medios en **Media Library** y asignarlos (tours: `image`, `gallery`, `itineraryFile`, `itinerary[].image`, `videos`; destinos, `media-slot`, paginas, blog, productos, `shareImage`). Publicar cada idioma (`en` y `es`). Un medio subido tiene prioridad sobre su campo `*Url`.
4. Poner `SEED_ON_EMPTY=false` y reiniciar (evita resembrar si algun dia la base queda vacia).
5. Settings > Webhooks: crear un webhook (eventos `entry.publish`, `entry.unpublish`, y `media.*` si se desea) hacia el despliegue del frontend, porque las paginas SSG fijan el contenido al construir.
6. Verificar: `GET https://cms.ejemplo.com/_health` (204) y `GET /api/tours?locale=es` sin credenciales.
7. Opcional: `CMS_URL=https://cms.ejemplo.com CMS_ADMIN_EMAIL=... CMS_ADMIN_PASSWORD=... node scripts/verify-uploads.mjs` comprueba subidas, populate del frontend, URLs y Range de video (limpia lo que crea; no usar con credenciales compartidas).

## Frontend

En el servidor Angular (no en el navegador): `STRAPI_URL` (URL con la que el servidor llega al CMS, puede ser interna), `STRAPI_PUBLIC_URL` (URL publica desde la que el navegador carga `/uploads/...`; las URLs de los medios son relativas con el proveedor local) y `FORMS_PROXY_SECRET` igual que en el CMS. Con `aws-s3` las URLs ya son absolutas (`S3_PUBLIC_URL`). Ver `CONTRACT.md`.

## Respaldos

- Postgres: `docker compose exec -T postgres pg_dump -U "$DATABASE_USERNAME" -Fc "$DATABASE_NAME" > desertica-$(date +%F).dump`; restaurar con `pg_restore --clean --if-exists -d <db> archivo.dump`.
- Medios (proveedor local): `docker run --rm -v <proyecto>_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .`. Con S3, activar versionado/replicacion del bucket.
- Guardar fuera del servidor los 6 secretos: sin `ENCRYPTION_KEY`/`API_TOKEN_SALT` originales los tokens existentes dejan de valer.
- Probar la restauracion en un entorno aparte al menos una vez.

## Actualizaciones

- Usar siempre la imagen de una version (`vX.Y.Z` o `sha-...`) y no `latest` en produccion; respaldar la base antes de actualizar.
- Cambios de esquema de Strapi se aplican solos al arrancar; no hay migraciones manuales salvo que `database/migrations` las incluya.
- Actualizar Strapi: subir las tres dependencias `@strapi/*` juntas a la misma version, `npm install`, `npm run build`, probar en local con una copia de la base.
- Cambiar un campo del contrato (ver `CONTRACT.md`) requiere desplegar tambien el frontend.

## Seguridad

- Servir el admin solo por HTTPS (proxy inverso con TLS y `PROXY=true`); considerar limitar `/admin` por IP/VPN.
- `server.url` = `PUBLIC_URL`. Tras un proxy, reenviar `X-Forwarded-Proto` y `X-Forwarded-For`. El limite de peticiones de formularios usa `X-Client-IP` solo si llega con `X-Forms-Secret` igual a `FORMS_PROXY_SECRET`; el proxy publico no debe reenviar esas cabeceras de clientes externos.
- El rol Public solo tiene lectura mas `create` de `reservation` y `contact-message` (se vuelve a conceder en cada arranque). No ampliarlo; si se quita la lectura publica, usar `STRAPI_API_TOKEN` en el frontend.
- Desactivar el seed en produccion tras el primer arranque; no subir `.env`.
- Rotar secretos si se filtran (invalida sesiones del admin y tokens). Crear tokens de API con el minimo permiso y vencimiento; eliminar los usados para pruebas.
- El login del admin tiene limite de intentos (429 tras varios fallos); no automatizar logins repetidos.
- CORS: `CLIENT_URLS` solo con origenes propios. CSP: `img-src`/`media-src` incluyen `'self'`, `PUBLIC_URL`, `S3_PUBLIC_URL` y `MEDIA_HOSTS`.
