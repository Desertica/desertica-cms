import type { Core } from '@strapi/strapi';
import { previewPath, previewUrl } from '../src/preview';

/**
 * Preview button in the editor: opens the page on the website (PREVIEW_URL) with a signed, 10-minute token.
 * Without PREVIEW_URL and PREVIEW_SECRET there is no `preview` key, so the button does not exist.
 */
const preview = (env: Core.Config.Shared.ConfigParams['env']) => {
  const base = env('PREVIEW_URL', '');
  const secret = env('PREVIEW_SECRET', '');
  if (!base || !secret) return {};
  return {
    preview: {
      enabled: true,
      config: {
        allowedOrigins: [new URL(base).origin],
        async handler(uid: string, { documentId, locale, status }: { documentId: string; locale?: string; status?: string }) {
          const row = await strapi.documents(uid as any).findOne({ documentId, locale, status: status === 'published' ? 'published' : 'draft', fields: ['slug'] as any });
          const path = row?.slug ? previewPath(uid, row.slug as string, locale ?? 'en') : null;
          return path ? previewUrl(base, path, secret) : null;
        },
      },
    },
  };
};

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
  ...preview(env),
});

export default config;
