import { factories } from '@strapi/strapi';

// Same list as CONTACT_FIELDS in desertica-web: `handled` is the staff's own flag.
const FIELDS = ['name', 'email', 'whatsapp', 'country', 'message', 'locale'];

export default factories.createCoreController('api::contact-message.contact-message', () => ({
  async create(ctx) {
    const data = ctx.request.body?.data ?? {};
    ctx.request.body = { data: Object.fromEntries(FIELDS.filter((key) => key in data).map((key) => [key, data[key]])) };
    return super.create(ctx);
  },
}));
