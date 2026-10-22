import { factories } from '@strapi/strapi';

// Same list as RESERVATION_FIELDS and RESERVATION_NUMBERS in desertica-web: `status` is the staff's and never comes from the form.
// `amount` is what the visitor saw (legacy flow); the booking API computes real amounts.
const FIELDS = ['tourSlug', 'tourTitle', 'date', 'language', 'format', 'payment', 'locale', 'name', 'email', 'phone', 'notes', 'adults', 'children', 'amount'];

export default factories.createCoreController('api::reservation.reservation', () => ({
  async create(ctx) {
    const raw = ctx.request.body?.data;
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    ctx.request.body = { data: Object.fromEntries(FIELDS.filter((key) => key in data).map((key) => [key, data[key]])) };
    return super.create(ctx);
  },
}));
