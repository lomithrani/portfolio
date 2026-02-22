export const validateEnvironment = () => {
  const requiredEnvironmentVariables = ['MONGO_URL', 'ALLOWED_DOMAINS', 'JWT_SECRET'];

  requiredEnvironmentVariables.forEach((requiredEnvironmentVariable) => {
    if (!Bun.env[requiredEnvironmentVariable]) {
      throw `${requiredEnvironmentVariable} not present`;
    }
  });

  if (!Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.warn('[WARN] OTEL_EXPORTER_OTLP_ENDPOINT not set — OpenTelemetry disabled');
  }

  if (!Bun.env.GOOGLE_CLIENT_ID || !Bun.env.GOOGLE_CLIENT_SECRET) {
    console.warn('[WARN] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Calendar features disabled');
  }
}