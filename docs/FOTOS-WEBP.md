# Fotos en WebP

Desde este cambio el CMS guarda **solo WebP** para las fotos. Los originales a tamaño completo los guarda el dueño en Google Drive.

## Qué pasa al subir un archivo

| Se sube | Se guarda |
| --- | --- |
| JPG, PNG, WebP, TIFF, AVIF | WebP, calidad 82, lado largo de 2400 px como máximo (nunca se agranda), girada según la orientación de la cámara, sin datos EXIF ni GPS. Nombre, `ext`, `mime`, `width`, `height` y `size` son los del WebP. |
| GIF, vídeo, PDF | Tal cual. |
| HEIC/HEIF (iPhone) | Se rechaza con un mensaje en español: la librería de imágenes (sharp) no lee HEIC. En el iPhone: *Ajustes > Cámara > Formatos > Más compatible*, o exportar la foto como JPG. |
| SVG, HTML | Prohibidos (`config/plugins.ts`). |

Strapi solo genera la miniatura `thumbnail` (también WebP) para la biblioteca de medios; los tamaños `small`/`medium`/`large` están desactivados (`breakpoints: {}`) porque la web solo lee `url` y ella misma hace las versiones reducidas (`/_img`).

Funciona igual con el disco local y con R2 (`UPLOAD_PROVIDER=aws-s3`): la conversión ocurre antes de entregar el archivo al proveedor. Código: `src/webp-upload.ts` (conectado en `src/extensions/upload/strapi-server.ts`).

## Fotos subidas antes (opcional)

Las fotos ya subidas **no se tocan solas**. Para convertirlas hay dos caminos:

- **Una a una, desde el panel:** *Biblioteca de Multimedia* > abrir la foto > *Reemplazar* y elegir el mismo archivo (o el original de Drive). Se guarda en WebP con el mismo ID, así que los tours y páginas que la usan no cambian.
- **Todas de una vez, con el script** `scripts/convert-photos-to-webp.mjs` (hace lo mismo que *Reemplazar*, foto por foto). Necesita una clave de API temporal de acceso completo (*Configuración > Tokens de API*, la duración más corta) que se guarda en el llavero de macOS, nunca en el chat ni en archivos, y se borra al terminar:

  ```bash
  security add-generic-password -a "$USER" -s strapi-stg-webp-temp -w   # pide la clave y la guarda
  export CMS_URL=https://<cms> CMS_TOKEN="$(security find-generic-password -a "$USER" -s strapi-stg-webp-temp -w)"
  BACKUP_DIR=~/desertica/respaldos/<cms>-uploads-<fecha> node scripts/convert-photos-to-webp.mjs   # copia de todo + lista
  APPLY=true ONLY=<id> node scripts/convert-photos-to-webp.mjs   # prueba con una foto
  APPLY=true node scripts/convert-photos-to-webp.mjs              # el resto
  security delete-generic-password -a "$USER" -s strapi-stg-webp-temp
  ```

  El script se detiene si el CMS todavía no convierte a WebP (código sin desplegar). Hacerlo primero en staging.

Detalle a saber: *Reemplazar* en Strapi conserva el nombre del archivo en el almacenamiento para que la dirección no cambie. Una foto antigua `..._abc123.jpg` queda con esa misma dirección terminada en `.jpg`, pero el contenido y el `mime` son WebP. En R2 se sirve como `image/webp`; con el disco local el servidor la anuncia como JPG y los navegadores la muestran igual. La web no se ve afectada: siempre pasa las fotos por `/_img`.
