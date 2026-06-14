import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireApiKey } from "../auth.js";
import { store } from "../store.js";

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireApiKey);

  app.get("/v1/files", async () => ({ success: true, files: store.listFiles() }));

  app.get("/v1/files/:id/download", async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const file = store.getFile(req.params.id);
    const bytes = await store.readFile(req.params.id);
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${file.filename}"`)
      .send(Buffer.from(bytes));
  });

  app.delete("/v1/files/:id", async (req: FastifyRequest<{ Params: { id: string } }>) => {
    await store.deleteFile(req.params.id);
    return { success: true };
  });
}
