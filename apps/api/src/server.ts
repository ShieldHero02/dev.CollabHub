import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { closePrisma } from "./plugins/prisma.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerAvailabilityRoutes } from "./modules/availability/availability.routes.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerImportRoutes } from "./modules/imports/imports.routes.js";
import { registerRoleRoutes } from "./modules/roles/roles.routes.js";
import { registerMeRoutes } from "./modules/users/me.routes.js";
import { registerUserRoutes } from "./modules/users/users.routes.js";

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

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid request payload", issues: error.issues });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return reply.code(409).send({ error: "conflict", message: "Unique constraint failed" });
    }
    server.log.error(error);
    return reply.code(500).send({ error: "internal_error", message: "Internal server error" });
  });

  server.addHook("onClose", async () => {
    await closePrisma();
  });

  await registerHealthRoutes(server);
  await registerAuthRoutes(server);
  await registerMeRoutes(server);
  await registerUserRoutes(server);
  await registerAvailabilityRoutes(server);
  await registerRoleRoutes(server);
  await registerImportRoutes(server);

  return server;
}

