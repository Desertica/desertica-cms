# Despliegue del CMS (Strapi 5)

El CI (`.github/workflows/ci.yml`) construye la imagen pero no la publica. Coolify construye el `Dockerfile` desde la rama de cada entorno: staging sigue la rama `staging` y producción la rama `prod` (flujo `develop` > `staging` > `prod`, ver `docs/PROTECCION-RAMAS.md`); `main` es solo la base y no se despliega. El contenedor escucha en el puerto 1337, corre como usuario `node` y responde `GET /_health` (204).

## Variables de entorno

| Variable | Obligatoria | Descripcion |
| --- | --- | --- |
| `APP_KEYS` | si | 4 secretos separados por coma (`openssl rand -base64 16` cuatro veces) |
| `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY`, `JWT_SECRET` | si | Un secreto distinto cada uno. Cambiar `ADMIN_JWT_SECRET`/`JWT_SECRET` cierra las sesiones; cambiar `ENCRYPTION_KEY` rompe lo cifrado (tokens de transferencia) |
| `PUBLIC_URL` | si | URL publica del CMS, `https://cms.ejemplo.com` (sin barra final). Define la URL del admin; no vuelve absolutas las URLs de los medios |
| `PROXY` | si (produccion) | `true` detras de un proxy inverso con TLS (cookies seguras del admin, IP real); con `NODE_ENV=production` el CMS no arranca sin el |
| `CLIENT_URLS` | si (sin ella el CMS no arranca en produccion) | Origenes CORS, separados por coma (origen del frontend y del admin si se sirve aparte) |
| `FORMS_PROXY_SECRET` | opcional | Mismo valor que en el servidor Angular. Solo firma la vista previa de borradores; sin el no hay boton. En produccion, 32 caracteres o mas (`openssl rand -hex 32`) |
| `DATABASE_CLIENT` | si | `postgres` en produccion (`sqlite` solo desarrollo) |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | si (postgres) | Conexion. Opcionales: `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_SCHEMA`, `DATABASE_POOL_MIN/MAX` |
| `SEED_ON_EMPTY` | no | `true` (por defecto) siembra una base que nunca se sembro (una vez; queda marcada en la base). Poner `false` tras el primer arranque |
| `UPLOAD_PROVIDER` | no | `local` (por defecto, `public/uploads`) o `aws-s3` |
| `UPLOAD_MAX_FILE_SIZE_MB` | no | Limite por archivo, 100 por defecto (cuerpo HTTP y plugin upload); si hay proxy inverso, subir tambien su limite (nginx `client_max_body_size`) |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | con `aws-s3` | Bucket y credenciales (sin llaves se usa la cadena por defecto del SDK, p. ej. rol IAM) |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | R2/MinIO/Spaces | Endpoint compatible S3; `S3_FORCE_PATH_STYLE=true` para MinIO |
| `S3_PUBLIC_URL` | recomendada | URL publica del bucket o CDN, prefijo de las URLs de los medios. Se anade a la CSP |
| `S3_ROOT_PATH`, `S3_ACL` | no | Carpeta dentro del bucket; ACL (vacio si el bucket las tiene desactivadas) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | no | Aviso por correo de cada reserva y mensaje nuevo. Solo se envia con `SMTP_HOST`, al correo de *Datos de la empresa* y desde `SMTP_USER` (`SMTP_PORT` 587 y `SMTP_SECURE` false se pueden cambiar si el proveedor lo pide); si falta `SMTP_HOST`, el CMS lo avisa una vez en el log |
| `MEDIA_HOSTS` | no | Hosts extra permitidos por la CSP para imagenes y video |
| `HOST`, `PORT` | no | 0.0.0.0 y 1337 |

Docker Compose usa ademas `CMS_HOST_PORT` (puerto publicado, 1337) y exige `DATABASE_PASSWORD`.

## Arranque con Docker Compose

```bash
cp .env.example .env     # secretos, DATABASE_PASSWORD, PUBLIC_URL, CLIENT_URLS
docker compose up -d --build
docker compose exec cms node_modules/.bin/strapi admin:create-user \
  --firstname Admin --lastname Desertica --email tu@correo --password '<clave larga>'
```

`docker-compose.yml` levanta `cms` + `postgres:16` con volumenes `pgdata` y `uploads` (`/opt/app/public/uploads`). En la primera arranque con la base vacia se siembra el catalogo. Con una imagen que tu mismo hayas construido y publicado: `CMS_IMAGE=<registro>/desertica-cms:<etiqueta> docker compose up -d --no-build`.

Sin Docker: `npm ci && npm run build && NODE_ENV=production npm run start` con las mismas variables (Node 22).

## Lista de primera puesta en marcha

1. Crear el administrador (comando de arriba o `/admin` si no hay ninguno).
2. Editar **Sitio — Datos de la empresa**: email, telefono, WhatsApp (solo digitos), redes (el seed trae marcadores `XXXX`). Revisar Colores y estilo, Reglas de reserva, Formularios y Menús. El RUC, la razon social, los precios y las reglas de reserva se cargan en el backoffice, no aqui.
3. Subir los medios en **Media Library** y asignarlos (tours: `image`, `gallery`, `itineraryFile`, `itinerary[].image`, `videos`; destinos, `media-slot`, paginas, blog, productos, `shareImage`). Publicar cada idioma (`en` y `es`). Un medio subido tiene prioridad sobre su campo `*Url`.
4. Poner `SEED_ON_EMPTY=false` y reiniciar (evita resembrar si algun dia la base queda vacia).
5. No hace falta webhook ni reconstruir el frontend: todas sus rutas se renderizan por peticion y leen el CMS con una cache corta (30 s por defecto, `STRAPI_CACHE_TTL_MS` en el frontend).
6. Verificar: `GET https://cms.ejemplo.com/_health` (204) y `GET /api/tours?locale=es` sin credenciales.
7. Opcional: `CMS_URL=https://cms.ejemplo.com CMS_ADMIN_EMAIL=... CMS_ADMIN_PASSWORD=... node scripts/verify-uploads.mjs` comprueba subidas, populate del frontend, URLs y Range de video (limpia lo que crea; **solo en staging**: crea un token de 7 días y publica medios de prueba en el tour `dune-buggy`, el destino `huacachina`, la página `terms` y `site-setting`, y si se interrumpe quedan; no usar con credenciales compartidas).

## Frontend

En el servidor Angular (no en el navegador): `STRAPI_URL` (URL con la que el servidor llega al CMS, puede ser interna), `STRAPI_PUBLIC_URL` (URL publica desde la que el navegador carga `/uploads/...`; las URLs de los medios son relativas con el proveedor local). Con `aws-s3` las URLs ya son absolutas (`S3_PUBLIC_URL`). Ver `CONTRACT.md`.

## Respaldos

- Postgres: `docker compose exec -T postgres pg_dump -U "$DATABASE_USERNAME" -Fc "$DATABASE_NAME" > desertica-$(date +%F).dump`; restaurar con `pg_restore --clean --if-exists -d <db> archivo.dump`.
- Medios (proveedor local): `docker run --rm -v <proyecto>_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .`. Con S3, activar versionado/replicacion del bucket.
- Guardar fuera del servidor los 6 secretos: sin `ENCRYPTION_KEY`/`API_TOKEN_SALT` originales los tokens existentes dejan de valer.
- Probar la restauracion en un entorno aparte al menos una vez.

## Pasar los medios a R2 (una vez por entorno)

Cambiar `UPLOAD_PROVIDER` solo afecta a lo que se sube despues: los archivos ya subidos siguen en `public/uploads` y la base guarda sus URLs `/uploads/...`. `scripts/migrate-uploads-to-s3.mjs` (incluido en la imagen) los copia al bucket y actualiza la base. Hacerlo primero en staging.

1. **Respaldar** la base (`pg_dump`, ver "Respaldos"); es la vuelta atras. Avisar a los editores que no suban medios mientras dura.
2. **Variables en Coolify** (servicio cms, "Environment Variables"), y redesplegar:
   - `UPLOAD_PROVIDER=aws-s3`
   - `S3_BUCKET=desertica-media`, `S3_REGION=auto`
   - `S3_ENDPOINT=https://<ID de cuenta>.r2.cloudflarestorage.com`, `S3_FORCE_PATH_STYLE=true`
   - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: token de API de R2 con "Object Read & Write" solo en `desertica-media` (marcarlas como secretas)
   - `S3_PUBLIC_URL=https://media.desertica.pe` (dominio propio del bucket, sin barra final)
   - `S3_ACL` y `S3_ROOT_PATH` vacias. No hace falta `MEDIA_HOSTS`: la CSP del panel ya anade `S3_PUBLIC_URL` a `img-src` y `media-src` (`config/middlewares.ts`).
3. **Simulacion**: en Coolify, servicio cms > Terminal (contenedor del CMS):
   ```bash
   cd /opt/app && node scripts/migrate-uploads-to-s3.mjs --dry-run
   ```
   Lista cada archivo y cada texto que cambiaria y termina con `Resumen: {"migrados":…,"omitidos":…,"errores":…,"textos":…,"enlaces":…}`. No sube ni escribe nada. Un "no está en disco" es un archivo que falta en el volumen: queda en `local` y se informa como error.
4. **Migracion**: el mismo comando sin `--dry-run`. Sube el original y sus formatos (thumbnail, small, medium, large) con la misma clave `<hash><ext>`, y luego cambia `url`, `provider` y las URLs de los formatos. Despues reescribe `/uploads/<archivo>` (relativa o con `PUBLIC_URL`) en los textos (`body`, `content`, `details` y demas campos de texto, en todos los idiomas y borradores) sin pasar por la traduccion automatica. No borra nada del volumen. Si se corta o hay errores, volver a ejecutarlo: solo procesa lo que sigue en `local` y los textos que aun apuntan a `/uploads/`.
5. **Verificar**:
   - Repetir `--dry-run`: debe dar `"migrados":0,"errores":0,"textos":0`.
   - En el panel, Media Library muestra las miniaturas y al abrir una imagen su URL empieza por `https://media.desertica.pe/`.
   - `curl -I https://media.desertica.pe/<archivo>` responde 200 con el tipo correcto; las paginas de la web muestran las imagenes y los videos.
   - Subir una imagen nueva y comprobar que tambien queda en `media.desertica.pe`.
6. **Volver atras**: poner `UPLOAD_PROVIDER=local` (o quitarla), redesplegar y restaurar el respaldo del paso 1 (`pg_restore --clean --if-exists`). Los archivos siguen en el volumen, asi que todo vuelve a verse como antes. Lo subido al bucket despues de la migracion no esta en ese respaldo. El volumen se puede vaciar solo cuando produccion lleve un tiempo funcionando con R2 (y con un respaldo `tar` guardado).

## Actualizaciones

- Producción despliega solo lo que llega a la rama `prod` por PR desde `staging`; no usar etiquetas `latest` ni desplegar desde `main`. Respaldar la base antes de actualizar.
- Cambios de esquema de Strapi se aplican solos al arrancar; no hay migraciones manuales salvo que `database/migrations` las incluya. Quitar un atributo **borra su columna** al arrancar: antes de desplegar una version que retira campos, seguir el "Orden de despliegue" de `CONTRACT.md`.
- Actualizar Strapi: subir las tres dependencias `@strapi/*` juntas a la misma version, `npm install`, `npm run build`, probar en local con una copia de la base.
- Cambiar un campo del contrato (ver `CONTRACT.md`) requiere desplegar tambien el frontend.

## Seguridad

- Servir el admin solo por HTTPS (proxy inverso con TLS y `PROXY=true`); considerar limitar `/admin` por IP/VPN.
- `server.url` = `PUBLIC_URL`. Tras un proxy, reenviar `X-Forwarded-Proto` y `X-Forwarded-For`.
- El rol Public solo tiene lectura (se vuelve a conceder en cada arranque). No ampliarlo; si se quita la lectura publica, usar `STRAPI_API_TOKEN` en el frontend.
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
   - Medios: un volumen montado en `/opt/app/public/uploads`, o bien R2/S3 con `UPLOAD_PROVIDER=aws-s3` y las variables `S3_*`.
   - Ajustes del servicio: puerto 1337, healthcheck en `/_health`.
3. Crear el administrador una sola vez desde el shell del servicio: `node_modules/.bin/strapi admin:create-user --firstname ... --lastname ... --email ... --password ...` (evita dejar `/admin` abierto a que cualquiera registre el primer usuario). Despues `SEED_ON_EMPTY=false`.
4. Dominio `cms.tudominio.com` hacia el servicio, y en Cloudflare el registro con proxy activado.
5. Sitio: ver `docs/DEPLOY.md` del repo `desertica-web`.
6. Staging: duplica el entorno en Railway, apuntalo a la rama de pruebas con su propia base de datos y sus propios secretos.

### Que esta verificado

El `Dockerfile`, Postgres (incluido `DATABASE_URL`, con la semilla), las subidas de medios y los workflows de CI e imagen estan probados. La configuracion concreta de Railway (referencias entre servicios, healthcheck, volumenes, dominios) esta escrita a partir de su documentacion y **no se ha probado en una cuenta real**.

## Seguridad de la API publica

- `global::public-guard` rechaza (415) cuerpos multipart anonimos fuera de `/api/upload` y fuerza `status=published` en peticiones sin `Authorization`, para que el rol Public no lea borradores.
- Al arrancar, el rol Public queda exactamente con `PUBLIC_ACTIONS` (se borra el registro de usuarios y demas rutas de users-permissions).
- En produccion, Strapi no arranca si algun secreto conserva el valor `changeMe` de `.env.example`.

## Contenido de ejemplo y textos nuevos

- `SEED_SAMPLE_TOUR=true` (solo staging) crea una vez el tour `[EJEMPLO] Tour completo` con todos los campos en lorem ipsum, en ingles y espanol, y un PDF de muestra. Es un tour normal: los socios lo duplican para empezar uno nuevo y lo borran cuando no lo necesiten.
- Al arrancar, los textos que la web gana despues del primer seed (por ejemplo el boton de WhatsApp o el banner de cookies) se agregan solos como filas de *Textos — Texto de la web*. Cada clave se ofrece una sola vez: una fila que un editor borra no vuelve y las existentes no se tocan. Las claves de pago, reservas, reclamaciones y descargo viven solo en el codigo de la web a proposito.

## Editor visual y traduccion automatica

- Los textos largos (`body` de paginas, `content` del blog y `details` de productos) usan el editor visual CKEditor 5 con el preset Markdown: el editor ve negritas, listas y enlaces, y el CMS sigue guardando Markdown, asi que la API y la web no cambian. El contenido existente se abre tal cual.
- `DEEPL_API_KEY` activa la traduccion automatica. En tours, destinos, articulos y productos, cada guardado de la version en espanol reescribe el borrador en ingles y el slug sale del nombre en ingles; con `SLUGS_LOCKED=true` (produccion, sitio ya publicado) el slug queda fijo desde la primera publicacion. Para textos, medios, reglas de reserva y menus queda el panel manual *Traduccion automatica* de la vista de edicion (traduce la version abierta al otro idioma y la guarda como **borrador**: nunca publica). Texto y componentes se traducen; precio, slug, iconos, rutas e imagenes se conservan. Una clave gratuita (`:fx`) cubre 500 000 caracteres al mes segun DeepL; verifica el limite vigente en su sitio.
- El endpoint es `POST /desertica/translate`, solo para sesiones del panel con permiso de edicion en ese tipo de contenido.

