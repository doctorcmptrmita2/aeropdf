import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { AeroError, type FileRecord, type FileSource, type Job, type JobType } from "@aeropdf/shared";
import { config } from "./config.js";

/**
 * In-memory metadata store + on-disk blob storage. The interface is intentionally narrow so a
 * Postgres + S3 driver can replace it in Phase-2 without touching the routes (Specs §6.4).
 */

const DEFAULT_USER = "user_local";

class Store {
  private files = new Map<string, FileRecord>();
  private jobs = new Map<string, Job>();
  private ready: Promise<void>;

  constructor() {
    this.ready = fs.mkdir(config.storagePath, { recursive: true }).then(() => undefined);
  }

  private blobPath(id: string): string {
    return path.join(config.storagePath, `${id}.pdf`);
  }

  async saveFile(params: {
    bytes: Uint8Array;
    filename: string;
    source: FileSource;
    pages: number;
  }): Promise<FileRecord> {
    await this.ready;
    const id = `file_${nanoid(12)}`;
    const storagePath = this.blobPath(id);
    try {
      await fs.writeFile(storagePath, params.bytes);
    } catch (e) {
      throw new AeroError("STORAGE_ERROR", `Failed to write file: ${(e as Error).message}`);
    }
    const record: FileRecord = {
      id,
      userId: DEFAULT_USER,
      type: "pdf",
      source: params.source,
      filename: params.filename,
      storagePath,
      pages: params.pages,
      sizeBytes: params.bytes.byteLength,
      createdAt: new Date().toISOString(),
    };
    this.files.set(id, record);
    return record;
  }

  getFile(id: string): FileRecord {
    const f = this.files.get(id);
    if (!f) throw new AeroError("FILE_NOT_FOUND", `File "${id}" not found`);
    return f;
  }

  async readFile(id: string): Promise<Uint8Array> {
    const f = this.getFile(id);
    try {
      return new Uint8Array(await fs.readFile(f.storagePath));
    } catch (e) {
      throw new AeroError("STORAGE_ERROR", `Failed to read file: ${(e as Error).message}`);
    }
  }

  async deleteFile(id: string): Promise<void> {
    const f = this.getFile(id);
    await fs.rm(f.storagePath, { force: true });
    this.files.delete(id);
  }

  listFiles(): FileRecord[] {
    return [...this.files.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createJob(type: JobType, input: Record<string, unknown>): Job {
    const job: Job = {
      id: `job_${nanoid(12)}`,
      userId: DEFAULT_USER,
      type,
      status: "processing",
      progress: 10,
      input,
      outputFileId: null,
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  completeJob(id: string, patch: { outputFileId?: string; outputFileIds?: string[] }): Job {
    const job = this.getJob(id);
    job.status = "completed";
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    if (patch.outputFileId) job.outputFileId = patch.outputFileId;
    if (patch.outputFileIds) job.outputFileIds = patch.outputFileIds;
    return job;
  }

  failJob(id: string, code: string, message: string): Job {
    const job = this.getJob(id);
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.error = { code, message };
    return job;
  }

  getJob(id: string): Job {
    const j = this.jobs.get(id);
    if (!j) throw new AeroError("JOB_NOT_FOUND", `Job "${id}" not found`);
    return j;
  }

  listJobs(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  getStats(): {
    filesGenerated: number;
    filesEdited: number;
    totalJobs: number;
    failedJobs: number;
    storageBytes: number;
    successRate: number;
  } {
    const files = this.listFiles();
    const jobs = this.listJobs();
    const failed = jobs.filter((j) => j.status === "failed").length;
    const done = jobs.filter((j) => j.status === "completed").length;
    return {
      filesGenerated: files.filter((f) => f.source === "generated").length,
      filesEdited: files.filter((f) => f.source === "edited").length,
      totalJobs: jobs.length,
      failedJobs: failed,
      storageBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
      successRate: jobs.length ? Math.round((done / jobs.length) * 1000) / 10 : 100,
    };
  }
}

export const store = new Store();
