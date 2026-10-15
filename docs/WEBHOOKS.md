# Webhook de publicacion (opcional)

Hoy no hace falta: el frontend lee el CMS con una cache de servidor corta (`STRAPI_CACHE_TTL_MS`, 30 s) y lo publicado se ve solo. Un webhook sirve si mas adelante se quiere invalidar al instante la cache del API (`desertica-api`) y de la web. Este repo no incluye codigo para ello: es configuracion del admin mas un receptor en el servicio que invalida.

## Configurar en Strapi

1. Admin > `Settings` > `Global settings` > `Webhooks` > `Create new webhook`.
2. `Name`: por ejemplo `invalidate-caches`. `URL`: endpoint HTTPS del receptor (API o web). Tiene que ser alcanzable desde el CMS.
3. `Headers`: anadir un secreto compartido, por ejemplo `X-Webhook-Secret: <valor largo aleatorio>`. El receptor debe rechazar peticiones sin el.
4. `Events` (seccion `Entry`): marcar `Publish` y `Unpublish`. Marcar tambien `Update` solo si se quieren avisos de cambios en contenido sin Draft & Publish (`translation`, `media-slot`, `reservation` y `contact-message` no usan borrador; `site-setting`, `theme-setting`, `booking-setting`, `form-setting` y `navigation` son single types). `Create` y `Delete` rara vez hacen falta. No marcar eventos de `Media` salvo que se necesiten.
5. `Save` y `Trigger` para probar; el panel muestra el codigo de respuesta.

## Que recibe el receptor

`POST` con JSON y cabeceras `Content-Type: application/json` y `X-Strapi-Event: <evento>` (mas las que se hayan configurado, p. ej. el secreto). Cuerpo:

```json
{ "event": "entry.publish", "createdAt": "2026-10-04T22:00:00.000Z", "model": "tour", "uid": "api::tour.tour",
  "entry": { "id": 4, "documentId": "...", "slug": "...", "locale": "es", "publishedAt": "...", "...": "..." } }
```

- `model` es el `singularName` (`tour`, `page`, `booking-setting`...); `uid` es el uid completo.
- `entry` es la fila completa y sanitizada (relaciones y componentes poblados, sin campos privados). En `entry.unpublish` y `entry.delete` no se puebla: llegan solo los campos propios.
- Con i18n llega un evento por idioma publicado/despublicado (`entry.locale`).
- `entry.update` se emite tambien al guardar un **borrador**; para saber que es publico usar `entry.publish`.
- No hay firma HMAC: la autenticacion es la cabecera secreta propia. El receptor tiene 10 s para responder, **no hay reintentos** (por eso la cache debe expirar por TTL) y Strapi procesa 5 envios a la vez.
- Solo `Publish` y `Unpublish` aparecen para tipos con borrador; los demas eventos (`Create`, `Update`, `Delete`, `Media`) son opcionales.

Verificado contra el codigo de Strapi 5.56.0 instalado (`@strapi/core` `webhook-runner` y `document-service/events`), no contra docs.strapi.io (sin acceso desde esta sesion: el proxy lo bloquea). Antes de escribir el receptor, pulsar `Trigger` en el admin: su cuerpo es solo `{ "event": "trigger-test", "createdAt": "..." }` (sin `model` ni `entry`), asi que sirve para probar conectividad y secreto, no el formato de los eventos reales.

## Notas

- Un webhook por destino (API y web) o uno solo que haga fan-out.
- Si se usa Cloudflare delante del CMS, el webhook sale del CMS al receptor; no pasa por la cache del CMS.
- Esta pensado como optimizacion: si el receptor falla, la cache expira sola por TTL.
