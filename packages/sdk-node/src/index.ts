import { AeroError, type GenerateRequest, type OverlayOp } from "@aeropdf/shared";

export interface AeroPDFOptions {
  apiKey: string;
  baseUrl?: string;
}

interface GenerateResponse {
  success: true;
  job_id: string;
  file_id: string;
  download_url: string;
  pages: number;
  size_bytes: number;
  renderer: "browser" | "structured";
}

interface EditResponse {
  success: true;
  job_id: string;
  output_file_id: string;
  download_url: string;
}

interface UploadResponse {
  success: true;
  file_id: string;
  pages: number;
  size_bytes: number;
}

interface SplitResponse {
  success: true;
  job_id: string;
  output_file_ids: string[];
  download_urls: string[];
}

/**
 * Minimal AeroPDF Node.js client (Specs §8). Thin wrapper over fetch; non-2xx responses are
 * rethrown as AeroError-shaped errors.
 */
export class AeroPDF {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: AeroPDFOptions) {
    if (!opts.apiKey) throw new AeroError("INVALID_API_KEY", "apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "http://localhost:8080").replace(/\/$/, "");
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(init.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (body.error ?? {}) as { code?: string; message?: string };
      throw new AeroError((err.code as never) ?? "INTERNAL", err.message ?? `HTTP ${res.status}`);
    }
    return body as T;
  }

  private json(path: string, payload: unknown): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  readonly pdf = {
    generate: (req: GenerateRequest): Promise<GenerateResponse> =>
      this.json("/v1/pdf/generate", req) as Promise<GenerateResponse>,

    upload: (bytes: Uint8Array, filename = "upload.pdf"): Promise<UploadResponse> => {
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
      return this.request("/v1/pdf/upload", { method: "POST", body: fd });
    },

    edit: (fileId: string, operations: OverlayOp[]): Promise<EditResponse> =>
      this.json("/v1/pdf/edit", { file_id: fileId, operations }) as Promise<EditResponse>,

    merge: (files: string[]): Promise<EditResponse> =>
      this.json("/v1/pdf/merge", { files }) as Promise<EditResponse>,

    split: (fileId: string, ranges: string[]): Promise<SplitResponse> =>
      this.json("/v1/pdf/split", { file_id: fileId, ranges }) as Promise<SplitResponse>,

    watermark: (fileId: string, text: string, opts: { opacity?: number; rotation?: number } = {}): Promise<EditResponse> =>
      this.json("/v1/pdf/watermark", { file_id: fileId, text, ...opts }) as Promise<EditResponse>,

    fillForm: (fileId: string, fields: Record<string, string | number | boolean>, flatten = false): Promise<EditResponse> =>
      this.json("/v1/pdf/fill-form", { file_id: fileId, fields, flatten }) as Promise<EditResponse>,

    download: async (fileId: string): Promise<Uint8Array> => {
      const res = await fetch(`${this.baseUrl}/v1/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) throw new AeroError("FILE_NOT_FOUND", `Could not download ${fileId}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };

  readonly jobs = {
    get: (jobId: string): Promise<unknown> => this.request(`/v1/jobs/${jobId}`, { method: "GET" }),
  };
}

export default AeroPDF;
