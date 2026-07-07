import type { FastifyInstance } from "fastify";
import { publicUser, resolveAuthUser } from "../auth/session.js";

export async function registerMeRoutes(server: FastifyInstance) {
  server.get("/api/me", async (request) => {
    const user = await resolveAuthUser(request);
    return {
      user: publicUser(user),
      authenticated: Boolean(user)
    };
  });
}

