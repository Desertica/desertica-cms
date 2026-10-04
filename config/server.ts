import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // Public URL of the CMS (https://cms.example.com). Sets the admin URL and cookie behaviour.
  // It does NOT make media URLs absolute: those stay relative (/uploads/...) with the local provider.
  url: env('PUBLIC_URL', ''),
  // Behind a reverse proxy / load balancer that terminates TLS set PROXY=true so Strapi trusts
  // X-Forwarded-Proto/-For (secure admin cookies, correct client IP). Leave false when exposed directly.
  proxy: { koa: env.bool('PROXY', false) },
  app: {
    keys: env.array('APP_KEYS'),
  },
});

export default config;
