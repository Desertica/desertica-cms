import type { Core } from '@strapi/strapi';

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c as '&']);

/** Short Spanish notice. It carries no e-mail, phone, notes or message text: whoever needs them opens the inbox in the panel. */
export function buildNotice(uid: string, row: Record<string, any>, panelUrl: string) {
  const reservation = uid === 'api::reservation.reservation';
  const subject = reservation ? 'Nueva solicitud de reserva' : 'Nuevo mensaje de contacto';
  const lines = reservation
    ? [`Tour: ${row.tourTitle || row.tourSlug}`, `Fecha: ${row.date}`, `Personas: ${Number(row.adults) + Number(row.children || 0)}`, `Nombre: ${row.name}`]
    : [`Nombre: ${row.name}`];
  const link = `${panelUrl.replace(/\/+$/, '')}/admin/content-manager/collection-types/${uid}`;
  return {
    subject,
    text: `${subject}.\n\n${lines.join('\n')}\n\nRevísalo en la Bandeja: ${link}`,
    html: `<p><strong>${subject}.</strong></p><p>${lines.map(esc).join('<br>')}</p><p><a href="${esc(link)}">Abrir la Bandeja</a></p>`,
  };
}

/**
 * Sends a notice to NOTIFY_EMAIL when a reservation or a contact message is created. Fire and forget: a mail failure is
 * logged and never delays or breaks the visitor's form. Without SMTP_HOST or NOTIFY_EMAIL nothing is sent (one warning).
 */
export function registerNotifications(strapi: Core.Strapi, env: Record<string, string | undefined> = process.env) {
  const to = (env.NOTIFY_EMAIL ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  if (!env.SMTP_HOST || !to.length) {
    strapi.log.warn('[notify] e-mail notices are off: set SMTP_HOST and NOTIFY_EMAIL to receive them');
    return;
  }
  strapi.db.lifecycles.subscribe({
    models: ['api::reservation.reservation', 'api::contact-message.contact-message'],
    afterCreate(event: any) {
      const notice = buildNotice(event.model.uid, event.result, env.PUBLIC_URL ?? '');
      // Not awaited on purpose.
      strapi.plugin('email').service('email').send({ to, ...notice }).catch((error: Error) => strapi.log.error(`[notify] e-mail not sent: ${error.message}`));
    },
  });
}
