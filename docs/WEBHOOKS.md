# Webhook de publicacion

Hay un receptor: el API (`desertica-api`, `POST /api/webhooks/cms`). Al publicar o despublicar un tour, el API sincroniza solo ese tour (lo crea inactivo si es nuevo, refresca su titulo y lo desactiva si ya no esta publicado en ningun idioma) y refresca su cache de tours. El boton "Sincronizar con el CMS" del backoffice sigue como respaldo: Strapi no reintenta.

La web no necesita webhook: lee el CMS con una cache de servidor corta (`STRAPI_CACHE_TTL_MS`, 30 s, mas 10 s de `PAGE_CACHE_TTL_MS`) y lo publicado se ve solo en menos de un minuto. Si algun dia hace falta al instante, este mismo evento puede ir a un segundo receptor en la web.

## Configurar en Strapi (staging)

1. Generar el secreto: `openssl rand -hex 32`. Cargarlo en Coolify en la app del API como `CMS_WEBHOOK_SECRET` y redesplegar el API.
2. Admin del CMS > `Settings` > `Global settings` > `Webhooks` > `Create new webhook`.
3. `Name`: `api-sync-tours`. `URL`: `https://api-stg.<dominio>/api/webhooks/cms` (o la URL interna del API si el CMS la alcanza por la red de Coolify).
4. `Headers`: `X-Webhook-Secret` = el mismo valor de `CMS_WEBHOOK_SECRET`. Sin esa cabecera, o con otro valor, el API responde 401.
5. `Events` (seccion `Entry`): marcar solo `Publish` y `Unpublish`. El API ignora (200 `ignored`) cualquier modelo que no sea `tour`, asi que no hace falta filtrar por tipo.
6. `Save` y `Trigger`: debe responder 200 (`{"ignored":true}`); 401 = secreto distinto, 503 = el API no tiene `CMS_WEBHOOK_SECRET`.
7. Prueba real: despublicar y volver a publicar un tour de prueba; en el backoffice, Tours, cambia su fecha de sincronizacion sin pulsar el boton.

En produccion, lo mismo con `https://api.<dominio>/api/webhooks/cms` y otro secreto.

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
- No hay firma HMAC: la autenticacion es la cabecera secreta propia (el API la compara en tiempo constante y limita a 30 avisos por minuto). El receptor tiene 10 s para responder, **no hay reintentos** (por eso la cache debe expirar por TTL) y Strapi procesa 5 envios a la vez.
- Solo `Publish` y `Unpublish` aparecen para tipos con borrador; los demas eventos (`Create`, `Update`, `Delete`, `Media`) son opcionales.

Verificado contra el codigo de Strapi 5.59.0 instalado (`@strapi/core` `webhook-runner` y `document-service/events`), no contra docs.strapi.io (sin acceso desde esta sesion: el proxy lo bloquea). Antes de escribir el receptor, pulsar `Trigger` en el admin: su cuerpo es solo `{ "event": "trigger-test", "createdAt": "..." }` (sin `model` ni `entry`), asi que sirve para probar conectividad y secreto, no el formato de los eventos reales.

## Notas

- Si se usa Cloudflare delante del CMS, el webhook sale del CMS al receptor; no pasa por la cache del CMS.
- Si el receptor falla, el aviso se pierde: la cache del API expira sola por TTL y el boton "Sincronizar con el CMS" pone todo al dia.
