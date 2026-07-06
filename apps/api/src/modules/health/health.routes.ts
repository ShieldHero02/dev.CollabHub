import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(server: FastifyInstance) {
  server.get("/api/health", async () => ({
    ok: true,
    service: "collabhub-api",
    version: "2.0.0-alpha.0"
  }));
}

