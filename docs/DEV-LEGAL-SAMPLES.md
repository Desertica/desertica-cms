# Descargo de ejemplo para desarrollo (NO LEGAL)

Para probar la firma del descargo sin esperar el texto real. **Solo para un CMS de desarrollo. Nunca en produccion.** El texto empieza con un aviso `NO LEGAL: MUESTRA DE DESARROLLO` en `en` y `es`.

Terminos, privacidad, cancelacion, cookies y conducta ya no estan en el CMS: se escriben en el backoffice (Configuracion > Documentos legales).

1. Arrancar el CMS de desarrollo (`npm run develop`) con la base sembrada.
2. Admin > `Settings` > `API Tokens` > `Create new API Token`, tipo `Full access`, y copiar el token (no se commitea).
3. ```bash
   CMS_URL=http://localhost:1337 CMS_API_TOKEN=<token> node scripts/dev-legal-samples.mjs [--tour <slug>]
   ```
   Guarda como **borrador**, en `en` y `es`, el `tour.waiverBody` del tour indicado con `--tour` (por defecto el primero por `order`). Sobrescribe el borrador que hubiera: no usarlo sobre contenido real.
4. Para que otra sesion lo lea: abrir el tour, elegir cada idioma y `Publish`. Cada **publicacion** del descargo crea una version nueva en el API; conviene publicarlo una vez y no tocarlo mientras se prueba la firma.
