import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireApiKey } from "../auth.js";
import { store } from "../store.js";

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireApiKey);

  app.get("/v1/jobs", async () => ({ success: true, jobs: store.listJobs() }));

  app.get("/v1/jobs/:id", async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const job = store.getJob(req.params.id);
    return {
      job_id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      output_file_id: job.outputFileId,
      output_file_ids: job.outputFileIds ?? null,
      error: job.error,
    };
  });

  app.get("/v1/stats", async () => ({ success: true, stats: store.getStats() }));
}
