const server = Bun.serve({
  hostname: "::",
  port: process.env.PORT ?? 3000,
  fetch(request) {
    return new Response(`Welcome to Bun! ${Bun.env.MONGO_URL}`);
  },
});

console.log(`Listening on http://localhost:${server.port}`);
