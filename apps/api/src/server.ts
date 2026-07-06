import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerMeRoutes } from "./modules/users/me.routes.js";

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  await server.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true
  });

  await registerHealthRoutes(server);
  await registerMeRoutes(server);

  return server;
}

