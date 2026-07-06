import type { FastifyInstance } from "fastify";

export async function registerMeRoutes(server: FastifyInstance) {
  server.get("/api/me", async () => ({
    user: null,
    authenticated: false
  }));
}

