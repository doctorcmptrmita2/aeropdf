import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AeroError } from "@aeropdf/shared";
import { config } from "./config.js";

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Bearer API-key auth (Specs §6.2). Applied as a preHandler to /v1/*.
 * Compares the presented key against the configured key in constant time.
 */
export async function requireApiKey(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const presented = match?.[1]?.trim();
  if (!presented || !timingSafeEqual(presented, config.apiKey)) {
    throw new AeroError("INVALID_API_KEY", "Missing or invalid API key");
  }
}
