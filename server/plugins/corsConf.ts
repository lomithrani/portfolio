import cors from "@elysiajs/cors";
import { env } from "../env";

// Applied once in createApp. ALLOWED_DOMAINS is parsed and validated at
// startup (env.ts); requests from any other origin get no CORS headers.
export const corsConf = () => cors({
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // traceparent/tracestate: W3C trace context propagated by the client
  allowedHeaders: ['Content-Type', 'traceparent', 'tracestate'],
  // Readable by the browser (the default, true, echoes the request's header names)
  exposeHeaders: ['Retry-After'],
  // Let browsers cache preflight results for 10 minutes (default is 5 s)
  maxAge: 600,
  origin: env.ALLOWED_DOMAINS
})
