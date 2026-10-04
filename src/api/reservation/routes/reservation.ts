import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::reservation.reservation', {
  only: ['create'],
  config: {
    create: {
      middlewares: [{ name: 'global::rate-limit', config: { max: 10, windowMs: 10 * 60 * 1000 } }],
    },
  },
});
