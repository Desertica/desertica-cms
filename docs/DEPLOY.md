# Despliegue del CMS (Strapi 5)

El CI (`.github/workflows/ci.yml`) construye la imagen pero no la publica. Coolify construye el `Dockerfile` desde la rama de cada entorno: staging sigue la rama `staging` y producción la rama `prod` (flujo `develop` > `staging` > `prod`, ver `docs/PROTECCION-RAMAS.md`); `main` es solo la base y no se despliega. El contenedor escucha en el puerto 1337, corre como usuario `node` y responde `GET /_health` (204).

## Variables de entorno

| Variable | Obligatoria | Descripcion |
| --- | --- | --- |
| `APP_KEYS` | si | 4 secretos separados por coma (`openssl rand -base64 16` cuatro veces) |
| `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY`, `JWT_SECRET` | si | Un secreto distinto cada uno. Cambiar `ADMIN_JWT_SECRET`/`JWT_SECRET` cierra las sesiones; cambiar `ENCRYPTION_KEY` rompe lo cifrado (tokens de transferencia) |
| `PUBLIC_URL` | si | URL publica del CMS, `https://cms.ejemplo.com` (sin barra final). Define la URL del admin; no vuelve absolutas las URLs de los medios |
| `PROXY` | si hay proxy | `true` detras de un proxy inverso con TLS (cookies seguras del admin, IP real) |
| `CLIENT_URLS` | si (sin ella el CMS no arranca en produccion) | Origenes CORS, separados por coma (origen del frontend y del admin si se sirve aparte) |
| `DATABASE_CLIENT` | si | `postgres` en produccion (`sqlite` solo desarrollo) |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | si (postgres) | Conexion. Opcionales: `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_SCHEMA`, `DATABASE_POOL_MIN/MAX` |
| `FORMS_PROXY_SECRET` | si | Mismo valor que en el servidor Angular. Sin el, el limite de peticiones usa la IP del proxy (todos los visitantes comparten cupo) |
| `SEED_ON_EMPTY` | no | `true` (por defecto) siembra una base que nunca se sembro (una vez; queda marcada en la base). Poner `false` tras el primer arranque |
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

`docker-compose.yml` levanta `cms` + `postgres:16` con volumenes `pgdata` y `uploads` (`/opt/app/public/uploads`). En la primera arranque con la base vacia se siembra el catalogo. Con una imagen que tu mismo hayas construido y publicado: `CMS_IMAGE=<registro>/desertica-cms:<etiqueta> docker compose up -d --no-build`.

Sin Docker: `npm ci && npm run build && NODE_ENV=production npm run start` con las mismas variables (Node 22).

## Lista de primera puesta en marcha

1. Crear el administrador (comando de arriba o `/admin` si no hay ninguno).
2. Editar **Sitio — Datos de la empresa**: email, telefono, WhatsApp (solo digitos), redes y datos legales (el seed trae marcadores `XXXX`). Revisar Colores y estilo, Reglas de reserva, Formularios y Menús.
3. Subir los medios en **Media Library** y asignarlos (tours: `image`, `gallery`, `itineraryFile`, `itinerary[].image`, `videos`; destinos, `media-slot`, paginas, blog, productos, `shareImage`). Publicar cada idioma (`en` y `es`). Un medio subido tiene prioridad sobre su campo `*Url`.
4. Poner `SEED_ON_EMPTY=false` y reiniciar (evita resembrar si algun dia la base queda vacia).
5. No hace falta webhook ni reconstruir el frontend: todas sus rutas se renderizan por peticion y leen el CMS con una cache corta (30 s por defecto, `STRAPI_CACHE_TTL_MS` en el frontend).
6. Verificar: `GET https://cms.ejemplo.com/_health` (204) y `GET /api/tours?locale=es` sin credenciales.
7. Opcional: `CMS_URL=https://cms.ejemplo.com CMS_ADMIN_EMAIL=... CMS_ADMIN_PASSWORD=... node scripts/verify-uploads.mjs` comprueba subidas, populate del frontend, URLs y Range de video (limpia lo que crea; **solo en staging**: crea un token de 7 días y publica medios de prueba en el tour `dune-buggy`, el destino `huacachina`, la página `terms` y `site-setting`, y si se interrumpe quedan; no usar con credenciales compartidas).

## Frontend

En el servidor Angular (no en el navegador): `STRAPI_URL` (URL con la que el servidor llega al CMS, puede ser interna), `STRAPI_PUBLIC_URL` (URL publica desde la que el navegador carga `/uploads/...`; las URLs de los medios son relativas con el proveedor local) y `FORMS_PROXY_SECRET` igual que en el CMS. Con `aws-s3` las URLs ya son absolutas (`S3_PUBLIC_URL`). Ver `CONTRACT.md`.

## Respaldos

- Postgres: `docker compose exec -T postgres pg_dump -U "$DATABASE_USERNAME" -Fc "$DATABASE_NAME" > desertica-$(date +%F).dump`; restaurar con `pg_restore --clean --if-exists -d <db> archivo.dump`.
- Medios (proveedor local): `docker run --rm -v <proyecto>_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .`. Con S3, activar versionado/replicacion del bucket.
- Guardar fuera del servidor los 6 secretos: sin `ENCRYPTION_KEY`/`API_TOKEN_SALT` originales los tokens existentes dejan de valer.
- Probar la restauracion en un entorno aparte al menos una vez.

## Actualizaciones

- Producción despliega solo lo que llega a la rama `prod` por PR desde `staging`; no usar etiquetas `latest` ni desplegar desde `main`. Respaldar la base antes de actualizar.
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


## Plataforma recomendada: Railway + Cloudflare

Para pruebas en entorno real (staging) y una primera produccion pequena.

**Por que Railway:** despliega cada repo privado de GitHub directamente desde su `Dockerfile` (el mismo que construye el CI, sin credenciales de registro), crea Postgres con un clic y entrega `DATABASE_URL`, tiene red privada entre servicios, volumenes, dominios con TLS y entornos separados (staging desde `develop`, produccion desde `prod`) con la opcion de esperar a que pase el CI. El costo es por uso; revisa los precios vigentes antes de decidir.
**Cloudflare delante:** DNS y CDN gratis, y R2 para los medios (compatible con S3, ver `UPLOAD_PROVIDER=aws-s3`). Si prefieres latencia desde Sao Paulo o mas control, las alternativas son Fly.io (region `gru`) o AWS (ECS + RDS + S3); el contenedor y las variables son los mismos.

### Pasos

1. Proyecto nuevo en Railway y servicio **PostgreSQL**.
2. Servicio **cms** desde `Desertica/desertica-cms` (rama `prod` en produccion, `staging` en staging). Variables:
   - `DATABASE_CLIENT=postgres`, `DATABASE_URL=${{Postgres.DATABASE_URL}}` (referencia al servicio Postgres), `DATABASE_SSL=false` (red privada).
   - `PUBLIC_URL=https://cms.tudominio.com`, `CLIENT_URLS=https://tudominio.com,https://www.tudominio.com`, `PROXY=true`.
   - `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY`, `JWT_SECRET`: valores aleatorios (`openssl rand -base64 24`; `APP_KEYS` son cuatro separados por coma).
   - `FORMS_PROXY_SECRET`: aleatorio, el mismo valor en el sitio.
   - Medios: un volumen montado en `/opt/app/public/uploads`, o bien R2/S3 con `UPLOAD_PROVIDER=aws-s3` y las variables `S3_*`.
   - Ajustes del servicio: puerto 1337, healthcheck en `/_health`.
3. Crear el administrador una sola vez desde el shell del servicio: `node_modules/.bin/strapi admin:create-user --firstname ... --lastname ... --email ... --password ...` (evita dejar `/admin` abierto a que cualquiera registre el primer usuario). Despues `SEED_ON_EMPTY=false`.
4. Dominio `cms.tudominio.com` hacia el servicio, y en Cloudflare el registro con proxy activado.
5. Sitio: ver `docs/DEPLOY.md` del repo `desertica-web`.
6. Staging: duplica el entorno en Railway, apuntalo a la rama de pruebas con su propia base de datos y sus propios secretos.

### Que esta verificado

El `Dockerfile`, Postgres (incluido `DATABASE_URL`, con la semilla), las subidas de medios y los workflows de CI e imagen estan probados. La configuracion concreta de Railway (referencias entre servicios, healthcheck, volumenes, dominios) esta escrita a partir de su documentacion y **no se ha probado en una cuenta real**.

## Seguridad de la API publica

- Con `FORMS_PROXY_SECRET` definido, `POST /api/reservations` y `POST /api/contact-messages` exigen la cabecera `X-Forms-Secret` con ese valor (403 sin ella): solo la web puede enviar formularios, y el limite de peticiones usa la IP real que ella reenvia. Para probar a mano con curl hay que enviar la cabecera.
- `global::public-guard` rechaza (415) cuerpos multipart anonimos fuera de `/api/upload` y fuerza `status=published` en peticiones sin `Authorization`, para que el rol Public no lea borradores.
- Al arrancar, el rol Public queda exactamente con `PUBLIC_ACTIONS` (se borra el registro de usuarios y demas rutas de users-permissions).
- En produccion, Strapi no arranca si algun secreto conserva el valor `changeMe` de `.env.example`.

## Contenido de ejemplo y textos nuevos

- `SEED_SAMPLE_TOUR=true` (solo staging) crea una vez el tour `[EJEMPLO] Tour completo` con todos los campos en lorem ipsum, en ingles y espanol, y un PDF de muestra. Es un tour normal: los socios lo duplican para empezar uno nuevo y lo borran cuando no lo necesiten.
- Al arrancar, los textos que la web gana despues del primer seed (por ejemplo el boton de WhatsApp o el banner de cookies) se agregan solos como filas de *Textos — Texto de la web*. Cada clave se ofrece una sola vez: una fila que un editor borra no vuelve y las existentes no se tocan. Las claves de pago, reservas, reclamaciones y descargo viven solo en el codigo de la web a proposito.

## Editor visual y traduccion automatica

- Los textos largos (`body` de paginas, `content` del blog, `details` de productos y `waiverBody` de los tours) usan el editor visual CKEditor 5 con el preset Markdown: el editor ve negritas, listas y enlaces, y el CMS sigue guardando Markdown, asi que la API y la web no cambian. El contenido existente se abre tal cual.
- `DEEPL_API_KEY` activa el panel *Traduccion automatica* de la vista de edicion (tours, destinos, paginas, blog, productos, textos, medios, reglas de reserva y menus). Traduce la version abierta (en o es) al otro idioma y la guarda como **borrador**: nunca publica. Texto y componentes se traducen; precio, slug, iconos, rutas e imagenes se conservan. Una clave gratuita (`:fx`) cubre 500 000 caracteres al mes segun DeepL; verifica el limite vigente en su sitio.
- El endpoint es `POST /desertica/translate`, solo para sesiones del panel con permiso de edicion en ese tipo de contenido.

