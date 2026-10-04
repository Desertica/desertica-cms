# Webhook de publicacion (opcional)

Hoy no hace falta: el frontend lee el CMS con una cache de servidor corta (`STRAPI_CACHE_TTL_MS`, 30 s) y lo publicado se ve solo. Un webhook sirve si mas adelante se quiere invalidar al instante la cache del API (`desertica-api`) y de la web. Este repo no incluye codigo para ello: es configuracion del admin mas un receptor en el servicio que invalida.

## Configurar en Strapi

1. Admin > `Settings` > `Global settings` > `Webhooks` > `Create new webhook`.
2. `Name`: por ejemplo `invalidate-caches`. `URL`: endpoint HTTPS del receptor (API o web). Tiene que ser alcanzable desde el CMS.
3. `Headers`: anadir un secreto compartido, por ejemplo `X-Webhook-Secret: <valor largo aleatorio>`. El receptor debe rechazar peticiones sin el.
4. `Events` (seccion `Entry`): marcar `Publish` y `Unpublish`. Marcar tambien `Update` solo si se quieren avisos de cambios en contenido sin Draft & Publish (`translation`, `media-slot`, `reservation` y `contact-message` no usan borrador; `site-setting`, `theme-setting`, `booking-setting`, `form-setting` y `navigation` son single types). `Create` y `Delete` rara vez hacen falta. No marcar eventos de `Media` salvo que se necesiten.
5. `Save` y `Trigger` para probar; el panel muestra el codigo de respuesta.

## Que recibe el receptor

`POST` con JSON, p. ej. `{ "event": "entry.publish", "createdAt": "...", "model": "tour", "uid": "api::tour.tour", "entry": { "documentId": "...", "slug": "...", "locale": "es", ... } }`. Con i18n llega un evento por idioma publicado. El receptor puede invalidar por `model` (y `entry.slug`/`entry.locale` si quiere ser fino) o vaciar todo. Responder 2xx rapido. La forma exacta del cuerpo y las opciones de la pantalla dependen de la version de Strapi (5.56.0 aqui): comprobar con `Trigger` antes de escribir el receptor.

## Notas

- Un webhook por destino (API y web) o uno solo que haga fan-out.
- Si se usa Cloudflare delante del CMS, el webhook sale del CMS al receptor; no pasa por la cache del CMS.
- Esta pensado como optimizacion: si el receptor falla, la cache expira sola por TTL.
