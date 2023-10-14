import cors from "@elysiajs/cors";
import Elysia from "elysia";

export const corsConf = () => new Elysia()
  .use(cors({
    credentials: true,
    methods: ['POST', 'GET', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    origin: (request: Request): boolean => {
      const origin = request.headers.get('origin');
      if (!origin) {
        return false;
      }
      const allowedOrigins = JSON.parse(Bun.env.ALLOWED_DOMAINS || '[]') as string[];
      return allowedOrigins.includes(origin);
    }
  }))