import type { Core } from '@strapi/strapi';

/**
 * Media library.
 *
 * - Default: files go to `public/uploads` (local provider). Keep that folder on a persistent volume.
 * - `UPLOAD_PROVIDER=aws-s3`: S3 or any S3-compatible store (R2, MinIO, Spaces, Backblaze...) for
 *   hosts with an ephemeral disk. See docs/DEPLOY.md.
 *
 * `UPLOAD_MAX_FILE_SIZE_MB` (default 200) is the plugin limit; `strapi::body` in config/middlewares.ts
 * reads the same variable so both limits always agree.
 */
const config = ({ env }: Core.Config.Shared.ConfigParams) => {
  const sizeLimit = env.int('UPLOAD_MAX_FILE_SIZE_MB', 200) * 1024 * 1024;
  const provider = env('UPLOAD_PROVIDER', 'local');
  // Color picker custom field (theme colors): plugin::color-picker.color, stores hex strings.
  // CKEditor 5 (Markdown preset): visual editor for long texts; it still stores Markdown, so the API output is unchanged.
  const customFields = { 'color-picker': { enabled: true }, ckeditor5: { enabled: true } };

  if (provider === 'aws-s3') {
    const accessKeyId = env('S3_ACCESS_KEY_ID');
    const secretAccessKey = env('S3_SECRET_ACCESS_KEY');
    const acl = env('S3_ACL', '');
    return {
      ...customFields,
      upload: {
        config: {
          provider: 'aws-s3',
          sizeLimit,
          providerOptions: {
            // Public base URL of the bucket or CDN (no trailing slash). Empty = the S3 object URL.
            baseUrl: env('S3_PUBLIC_URL', '') || undefined,
            rootPath: env('S3_ROOT_PATH', '') || undefined,
            s3Options: {
              // Without keys the AWS SDK falls back to its default chain (IAM role, env, profile).
              ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
              region: env('S3_REGION', 'us-east-1'),
              endpoint: env('S3_ENDPOINT', '') || undefined,
              forcePathStyle: env.bool('S3_FORCE_PATH_STYLE', false),
              // AWS SDK v3 adds CRC32 checksums by default, which breaks multipart uploads (files > 5 MB, i.e.
              // videos) on several S3-compatible stores. WHEN_REQUIRED keeps AWS S3 working and fixes those.
              requestChecksumCalculation: 'WHEN_REQUIRED',
              responseChecksumValidation: 'WHEN_REQUIRED',
              params: {
                Bucket: env('S3_BUCKET'),
                // Leave empty for buckets with ACLs disabled (the default on new AWS buckets); public
                // read is then granted by a bucket policy or by the CDN.
                ...(acl ? { ACL: acl } : {}),
              },
            },
          },
          actionOptions: { upload: {}, uploadStream: {}, delete: {} },
        },
      },
    };
  }

  return { ...customFields, upload: { config: { sizeLimit } } };
};

export default config;
