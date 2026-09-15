/**
 * Public origin of the store, without a trailing slash.
 * APP_URL wins; when it is unset or empty on Vercel, the deployment's own URL is used
 * (the production domain for production deployments, the unique deployment URL for previews).
 */
export function resolveSiteUrl(value: string | undefined = process.env.APP_URL): string {
  const configured = value?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelHost = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL : process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}
