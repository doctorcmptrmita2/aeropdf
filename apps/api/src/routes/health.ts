import type { FastifyInstance } from "fastify";
import { htmlPdfAvailable } from "@aeropdf/template-engine";
import { config } from "../config.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    version: config.version,
    uptime: Math.round(process.uptime()),
    htmlToPdf: await htmlPdfAvailable(),
  }));
}
