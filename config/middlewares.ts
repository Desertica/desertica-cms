import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  // Hosts that may serve media to the admin (Media Library previews) and to pages that embed Strapi
  // content. With the S3 provider the bucket/CDN host (S3_PUBLIC_URL) is added automatically;
  // MEDIA_HOSTS adds more (comma separated).
  const mediaHosts = [
    "'self'",
    'data:',
    'blob:',
    'market-assets.strapi.io',
    env('PUBLIC_URL', ''),
    env('S3_PUBLIC_URL', ''),
    ...env.array('MEDIA_HOSTS', []),
  ].filter(Boolean);

  // Same variable as the upload plugin limit (config/plugins.ts): both limits always agree.
  const maxFileSize = env.int('UPLOAD_MAX_FILE_SIZE_MB', 200) * 1024 * 1024;

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': ["'self'", 'https:'],
            'img-src': [...mediaHosts, 'images.unsplash.com', '*.unsplash.com'],
            'media-src': [...mediaHosts, '*.unsplash.com'],
            upgradeInsecureRequests: null,
          },
        },
      },
    },
    {
      name: 'strapi::cors',
      config: {
        // Browser origins allowed to call the API (the frontend calls Strapi from its server, so
        // normally only the admin origin and local dev matter).
        origin: env.array('CLIENT_URLS', ['http://localhost:4200', 'http://localhost:4000']),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
        keepHeaderOnError: true,
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    'global::public-guard',
    {
      name: 'strapi::body',
      config: {
        // Forms and JSON are small; files travel as multipart, which has its own limit below.
        formLimit: '1mb',
        jsonLimit: '2mb',
        textLimit: '1mb',
        formidable: { maxFileSize },
      },
    },
    'strapi::session',
    { name: 'strapi::favicon', config: { path: './public/favicon.png' } },
    'strapi::public',
  ];
};

export default config;
