import { buildServer } from "./server.js";

const server = await buildServer();
const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);

try {
  await server.listen({ host, port });
  server.log.info({ host, port }, "CollabHub API listening");
} catch (error) {
  server.log.error(error);
  process.exit(1);
}

