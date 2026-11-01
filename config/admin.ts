import type { Core } from '@strapi/strapi';
import { previewBase, previewPath, previewUrl } from '../src/preview';

/**
 * Preview button in the editor: opens the page on the website (the first CLIENT_URLS entry) with a signed, 10-minute token.
 * The signing key is FORMS_PROXY_SECRET, the same value the website already has. Without CLIENT_URLS and FORMS_PROXY_SECRET
 * there is no `preview` key, so the button does not exist.
 */
const preview = (env: Core.Config.Shared.ConfigParams['env']) => {
  const base = previewBase(env('CLIENT_URLS', ''));
  const secret = env('FORMS_PROXY_SECRET', '');
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
  // Off by default: promoteEE adds the Releases, Review Workflows, SSO, Audit Logs and Content History "buy" entries
  // to Settings (paid features nobody here can use); nps is Strapi's satisfaction survey pop-up.
  flags: {
    nps: false,
    promoteEE: false,
  },
  ...preview(env),
});

export default config;
