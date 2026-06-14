import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  AeroError,
  type GenerateRequest,
  type OverlayOp,
} from "@aeropdf/shared";
import { generatePdf, BUILTIN_TEMPLATES } from "@aeropdf/template-engine";
import {
  applyOverlay,
  mergePdfs,
  splitPdf,
  addWatermark,
  fillForm,
  getInfo,
} from "@aeropdf/pdf-engine";
import { requireApiKey } from "../auth.js";
import { store } from "../store.js";

function downloadUrl(req: FastifyRequest, fileId: string): string {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  const host = req.headers.host;
  return `${proto}://${host}/v1/files/${fileId}/download`;
}

export async function pdfRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireApiKey);

  // List built-in templates (used by the dashboard playground).
  app.get("/v1/templates", async () => ({
    success: true,
    templates: BUILTIN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, sample_data: t.sampleData })),
  }));

  // ---------------------------------------------------------------- generate
  app.post("/v1/pdf/generate", async (req: FastifyRequest<{ Body: GenerateRequest }>) => {
    const body = req.body ?? ({} as GenerateRequest);
    const job = store.createJob("pdf.generate", body as unknown as Record<string, unknown>);
    try {
      const result = await generatePdf(body);
      const file = await store.saveFile({
        bytes: result.bytes,
        filename: `${body.templateId ?? body.source ?? "document"}.pdf`,
        source: "generated",
        pages: result.pages,
      });
      store.completeJob(job.id, { outputFileId: file.id });
      return {
        success: true,
        job_id: job.id,
        file_id: file.id,
        download_url: downloadUrl(req, file.id),
        pages: file.pages,
        size_bytes: file.sizeBytes,
        renderer: result.renderer,
      };
    } catch (e) {
      const err = e instanceof AeroError ? e : new AeroError("PDF_RENDER_FAILED", (e as Error).message);
      store.failJob(job.id, err.code, err.message);
      throw err;
    }
  });

  // ---------------------------------------------------------------- upload
  app.post("/v1/pdf/upload", async (req) => {
    const part = await req.file();
    if (!part) throw new AeroError("VALIDATION_ERROR", "No file uploaded (field 'file')");
    const bytes = new Uint8Array(await part.toBuffer());
    const info = await getInfo(bytes); // validates %PDF + counts pages
    const file = await store.saveFile({
      bytes,
      filename: part.filename || "upload.pdf",
      source: "uploaded",
      pages: info.pages,
    });
    return { success: true, file_id: file.id, pages: file.pages, size_bytes: file.sizeBytes };
  });

  // ---------------------------------------------------------------- edit (overlay)
  app.post(
    "/v1/pdf/edit",
    async (req: FastifyRequest<{ Body: { file_id?: string; operations?: OverlayOp[] } }>) => {
      const { file_id, operations } = req.body ?? {};
      if (!file_id) throw new AeroError("VALIDATION_ERROR", "file_id is required");
      if (!Array.isArray(operations) || operations.length === 0) {
        throw new AeroError("VALIDATION_ERROR", "operations[] is required");
      }
      const job = store.createJob("pdf.edit", req.body as Record<string, unknown>);
      try {
        const src = await store.readFile(file_id);
        const out = await applyOverlay(src, operations);
        const info = await getInfo(out);
        const file = await store.saveFile({ bytes: out, filename: "edited.pdf", source: "edited", pages: info.pages });
        store.completeJob(job.id, { outputFileId: file.id });
        return { success: true, job_id: job.id, output_file_id: file.id, download_url: downloadUrl(req, file.id) };
      } catch (e) {
        const err = e instanceof AeroError ? e : new AeroError("PDF_RENDER_FAILED", (e as Error).message);
        store.failJob(job.id, err.code, err.message);
        throw err;
      }
    },
  );

  // ---------------------------------------------------------------- merge
  app.post("/v1/pdf/merge", async (req: FastifyRequest<{ Body: { files?: string[] } }>) => {
    const files = req.body?.files;
    if (!Array.isArray(files) || files.length < 2) {
      throw new AeroError("VALIDATION_ERROR", "files[] must contain at least 2 file ids");
    }
    const job = store.createJob("pdf.merge", req.body as Record<string, unknown>);
    try {
      const buffers = await Promise.all(files.map((id) => store.readFile(id)));
      const out = await mergePdfs(buffers);
      const info = await getInfo(out);
      const file = await store.saveFile({ bytes: out, filename: "merged.pdf", source: "edited", pages: info.pages });
      store.completeJob(job.id, { outputFileId: file.id });
      return { success: true, job_id: job.id, output_file_id: file.id, download_url: downloadUrl(req, file.id) };
    } catch (e) {
      const err = e instanceof AeroError ? e : new AeroError("PDF_RENDER_FAILED", (e as Error).message);
      store.failJob(job.id, err.code, err.message);
      throw err;
    }
  });

  // ---------------------------------------------------------------- split
  app.post("/v1/pdf/split", async (req: FastifyRequest<{ Body: { file_id?: string; ranges?: string[] } }>) => {
    const { file_id, ranges } = req.body ?? {};
    if (!file_id) throw new AeroError("VALIDATION_ERROR", "file_id is required");
    if (!Array.isArray(ranges) || ranges.length === 0) throw new AeroError("VALIDATION_ERROR", "ranges[] is required");
    const job = store.createJob("pdf.split", req.body as Record<string, unknown>);
    try {
      const src = await store.readFile(file_id);
      const parts = await splitPdf(src, ranges);
      const ids: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const info = await getInfo(parts[i]);
        const file = await store.saveFile({ bytes: parts[i], filename: `split-${i + 1}.pdf`, source: "edited", pages: info.pages });
        ids.push(file.id);
      }
      store.completeJob(job.id, { outputFileIds: ids });
      return { success: true, job_id: job.id, output_file_ids: ids, download_urls: ids.map((id) => downloadUrl(req, id)) };
    } catch (e) {
      const err = e instanceof AeroError ? e : new AeroError("PDF_RENDER_FAILED", (e as Error).message);
      store.failJob(job.id, err.code, err.message);
      throw err;
    }
  });

  // ---------------------------------------------------------------- watermark
  app.post(
    "/v1/pdf/watermark",
    async (req: FastifyRequest<{ Body: { file_id?: string; text?: string; opacity?: number; rotation?: number } }>) => {
      const { file_id, text, opacity, rotation } = req.body ?? {};
      if (!file_id) throw new AeroError("VALIDATION_ERROR", "file_id is required");
      if (!text) throw new AeroError("VALIDATION_ERROR", "text is required");
      const job = store.createJob("pdf.watermark", req.body as Record<string, unknown>);
      try {
        const src = await store.readFile(file_id);
        const out = await addWatermark(src, text, { opacity, rotation });
        const info = await getInfo(out);
        const file = await store.saveFile({ bytes: out, filename: "watermarked.pdf", source: "edited", pages: info.pages });
        store.completeJob(job.id, { outputFileId: file.id });
        return { success: true, job_id: job.id, output_file_id: file.id, download_url: downloadUrl(req, file.id) };
      } catch (e) {
        const err = e instanceof AeroError ? e : new AeroError("PDF_RENDER_FAILED", (e as Error).message);
        store.failJob(job.id, err.code, err.message);
        throw err;
      }
    },
  );

  // ---------------------------------------------------------------- fill-form
  app.post(
    "/v1/pdf/fill-form",
    async (req: FastifyRequest<{ Body: { file_id?: string; fields?: Record<string, string | number | boolean>; flatten?: boolean } }>) => {
      const { file_id, fields, flatten } = req.body ?? {};
      if (!file_id) throw new AeroError("VALIDATION_ERROR", "file_id is required");
      if (!fields || typeof fields !== "object") throw new AeroError("VALIDATION_ERROR", "fields object is required");
      const job = store.createJob("pdf.fill_form", req.body as Record<string, unknown>);
      try {
        const src = await store.readFile(file_id);
        const out = await fillForm(src, fields, Boolean(flatten));
        const info = await getInfo(out);
        const file = await store.saveFile({ bytes: out, filename: "filled.pdf", source: "edited", pages: info.pages });
        store.completeJob(job.id, { outputFileId: file.id });
        return { success: true, job_id: job.id, output_file_id: file.id, download_url: downloadUrl(req, file.id) };
      } catch (e) {
        const err = e instanceof AeroError ? e : new AeroError("PDF_RENDER_FAILED", (e as Error).message);
        store.failJob(job.id, err.code, err.message);
        throw err;
      }
    },
  );
}
