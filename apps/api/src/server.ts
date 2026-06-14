import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { AeroError, toAeroError } from "@aeropdf/shared";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { pdfRoutes } from "./routes/pdf.js";
import { jobRoutes } from "./routes/jobs.js";
import { fileRoutes } from "./routes/files.js";

export async function buildServer() {
  const app = Fastify({
    logger: { transport: undefined, level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: config.maxUploadMb * 1024 * 1024,
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  });

  // Canonical error envelope (PRD §16.1).
  app.setErrorHandler((error, _req, reply) => {
    const aero = error instanceof AeroError ? error : toAeroError(error);
    if (aero.statusCode >= 500) app.log.error({ err: error }, "request failed");
    reply.status(aero.statusCode).send(aero.toResponse());
  });

  // API routes.
  await app.register(healthRoutes);
  await app.register(pdfRoutes);
  await app.register(jobRoutes);
  await app.register(fileRoutes);

  // Static dashboard + landing (served last so /v1 + /health win).
  // Guard: if the assets dir is missing (misconfigured DASHBOARD_DIR), keep the API alive
  // instead of failing the whole server — @fastify/static throws when root doesn't exist.
  if (existsSync(config.dashboardDir)) {
    await app.register(fastifyStatic, { root: config.dashboardDir, prefix: "/" });
    app.get("/dashboard", (_req, reply) => reply.sendFile("dashboard.html"));
    app.get("/editor", (_req, reply) => reply.sendFile("editor.html"));
  } else {
    app.log.warn(`DASHBOARD_DIR not found, static UI disabled: ${config.dashboardDir}`);
    app.get("/", async () => ({ service: "aeropdf", status: "ok", ui: "disabled", api: "/v1, /health" }));
  }

  return app;
}

/**
 * Build + listen. Exported so the production entry (apps/api/src/main.ts) and Passenger-style
 * hosts can start the server without the import.meta main-module check.
 */
export async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`AeroPDF API listening on http://${config.host}:${config.port}`);
    app.log.info(`Landing  → http://localhost:${config.port}/`);
    app.log.info(`Dashboard → http://localhost:${config.port}/dashboard`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
  return app;
}

// Run when executed directly (dev: `tsx apps/api/src/server.ts`).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) void start();
