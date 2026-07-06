import type { FastifyReply } from "fastify";

export function forbidden(reply: FastifyReply, message = "Forbidden") {
  return reply.code(403).send({ error: "forbidden", message });
}

export function unauthorized(reply: FastifyReply, message = "Unauthorized") {
  return reply.code(401).send({ error: "unauthorized", message });
}

