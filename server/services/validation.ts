export const validateEnvironment = () => {
  const requiredEnvironmentVariables = ['MONGO_URL', 'ALLOWED_DOMAINS', 'JWT_SECRET'];

  requiredEnvironmentVariables.forEach((requiredEnvironmentVariable) => {
    if (!Bun.env[requiredEnvironmentVariable]) {
      throw `${requiredEnvironmentVariable} not present`;
    }
  });
}