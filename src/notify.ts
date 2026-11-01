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
 * Sends a notice to the e-mail of "Datos de la empresa" (site-setting) when a reservation or a contact message is created.
 * Fire and forget: a mail failure is logged and never delays or breaks the visitor's form. Without SMTP_HOST nothing is
 * sent (one warning); without a company e-mail the notice is skipped with a warning.
 */
export function registerNotifications(strapi: Core.Strapi, env: Record<string, string | undefined> = process.env) {
  if (!env.SMTP_HOST) {
    strapi.log.warn('[notify] e-mail notices are off: set SMTP_HOST to receive them');
    return;
  }
  strapi.db.lifecycles.subscribe({
    models: ['api::reservation.reservation', 'api::contact-message.contact-message'],
    afterCreate(event: any) {
      const notice = buildNotice(event.model.uid, event.result, env.PUBLIC_URL ?? '');
      // Not awaited on purpose.
      Promise.resolve(strapi.documents('api::site-setting.site-setting').findFirst({ fields: ['email'] } as any))
        .then((setting: any) => {
          if (!setting?.email) return strapi.log.warn('[notify] no e-mail in "Datos de la empresa"; notice not sent');
          return strapi.plugin('email').service('email').send({ to: setting.email, ...notice });
        })
        .catch((error: Error) => strapi.log.error(`[notify] e-mail not sent: ${error.message}`));
    },
  });
}
