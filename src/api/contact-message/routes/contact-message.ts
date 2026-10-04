import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::contact-message.contact-message', {
  only: ['create'],
  config: {
    create: {
      middlewares: [{ name: 'global::rate-limit', config: { max: 5, windowMs: 10 * 60 * 1000 } }],
    },
  },
});
