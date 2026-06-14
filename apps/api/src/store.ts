import fs from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { AeroError, type FileRecord, type FileSource, type Job, type JobType } from "@aeropdf/shared";
import { config } from "./config.js";

/**
 * Disk-backed metadata store + on-disk blob storage. Blobs live under STORAGE_PATH and the
 * file/job index is persisted to STORAGE_PATH/_index.json, so metadata survives restarts (no
 * Postgres needed). The interface stays narrow so a Postgres + S3 driver can replace it later.
 */

const DEFAULT_USER = "user_local";
const MAX_JOBS = 300; // cap the persisted job history

class Store {
  private files = new Map<string, FileRecord>();
  private jobs = new Map<string, Job>();
  private ready: Promise<void>;
  private indexFile = path.join(config.storagePath, "_index.json");
  private writeChain: Promise<void> = Promise.resolve();

  constructor() {
    // Synchronous init so the index is available before the first request is served.
    mkdirSync(config.storagePath, { recursive: true });
    this.loadIndex();
    this.ready = Promise.resolve();
  }

  /** Load the persisted index, pruning file records whose blob no longer exists on disk. */
  private loadIndex(): void {
    if (!existsSync(this.indexFile)) return;
    try {
      const raw = JSON.parse(readFileSync(this.indexFile, "utf8")) as { files?: FileRecord[]; jobs?: Job[] };
      for (const f of raw.files ?? []) {
        if (existsSync(f.storagePath)) this.files.set(f.id, f);
      }
      for (const j of raw.jobs ?? []) this.jobs.set(j.id, j);
    } catch {
      // Corrupt index → start clean rather than crash.
    }
  }

  /** Serialize the index to disk (serialized via a write chain to avoid overlapping writes). */
  private persist(): void {
    const files = [...this.files.values()];
    const jobs = this.listJobs().slice(0, MAX_JOBS);
    const payload = JSON.stringify({ files, jobs });
    this.writeChain = this.writeChain
      .then(() => fs.writeFile(this.indexFile, payload))
      .catch(() => undefined);
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
    this.persist();
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
    this.persist();
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
    this.persist();
    return job;
  }

  completeJob(id: string, patch: { outputFileId?: string; outputFileIds?: string[] }): Job {
    const job = this.getJob(id);
    job.status = "completed";
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    if (patch.outputFileId) job.outputFileId = patch.outputFileId;
    if (patch.outputFileIds) job.outputFileIds = patch.outputFileIds;
    this.persist();
    return job;
  }

  failJob(id: string, code: string, message: string): Job {
    const job = this.getJob(id);
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.error = { code, message };
    this.persist();
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
