/** Refuses to start in production with settings that are unsafe or silently wrong. */
export function assertProductionEnv(env: Record<string, string | undefined>) {
  if (env.NODE_ENV !== 'production') return;

  // The example secrets are public in the repo: signing admin tokens with them would open the panel.
  const placeholders = ['APP_KEYS', 'API_TOKEN_SALT', 'ADMIN_JWT_SECRET', 'TRANSFER_TOKEN_SALT', 'ENCRYPTION_KEY', 'JWT_SECRET'].filter((key) =>
    /changeMe/i.test(env[key] ?? ''),
  );
  if (placeholders.length) throw new Error(`Placeholder secrets in production: ${placeholders.join(', ')}. Generate real values.`);

  // Without it every visitor shares the proxy's IP: ten form submissions in ten minutes for the whole website.
  if (!env.FORMS_PROXY_SECRET) throw new Error('FORMS_PROXY_SECRET is required in production (the same value as the website).');

  // Without it CORS falls back to localhost and the real origins fail with no hint of why.
  if (!env.CLIENT_URLS) throw new Error('CLIENT_URLS is required in production (the origins of the website and the admin).');
}
