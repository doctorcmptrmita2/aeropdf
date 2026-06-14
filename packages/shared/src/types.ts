/** Core domain entities and DTOs shared across packages (PRD §13). */

export type PlanName = "free" | "starter" | "pro" | "business";

export interface User {
  id: string;
  email: string;
  name: string;
  plan: PlanName;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Template {
  id: string;
  userId: string;
  name: string;
  slug: string;
  html: string;
  css?: string;
  sampleData: Record<string, unknown>;
  version: number;
  createdAt: string;
}

export type FileSource = "generated" | "uploaded" | "edited";

export interface FileRecord {
  id: string;
  userId: string;
  type: "pdf";
  source: FileSource;
  filename: string;
  storagePath: string;
  pages: number;
  sizeBytes: number;
  createdAt: string;
}

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type JobType =
  | "pdf.generate"
  | "pdf.edit"
  | "pdf.merge"
  | "pdf.split"
  | "pdf.watermark"
  | "pdf.fill_form";

export interface Job {
  id: string;
  userId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  input: Record<string, unknown>;
  outputFileId: string | null;
  outputFileIds?: string[];
  error: { code: string; message: string } | null;
  startedAt: string;
  completedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Overlay edit operations (PRD §8.5)
 * Coordinates are PDF points, origin bottom-left (pdf-lib convention).
 * ------------------------------------------------------------------ */

export interface OverlayText {
  type: "add_text";
  page: number;
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  color?: string;
  rotation?: number;
  opacity?: number;
}

export interface OverlayImage {
  type: "add_image";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** base64-encoded PNG or JPEG (with or without data: prefix) */
  imageBase64: string;
  opacity?: number;
}

export interface OverlaySignature extends Omit<OverlayImage, "type"> {
  type: "add_signature";
}

export interface OverlayWatermark {
  type: "add_watermark";
  text: string;
  opacity?: number;
  rotation?: number;
  color?: string;
  fontSize?: number;
  /** 1-based page numbers; omit for all pages */
  pages?: number[];
}

export interface OverlayRect {
  type: "add_rect";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
}

export interface OverlayLine {
  type: "add_line";
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  thickness?: number;
}

export type OverlayOp =
  | OverlayText
  | OverlayImage
  | OverlaySignature
  | OverlayWatermark
  | OverlayRect
  | OverlayLine;

/* ------------------------------------------------------------------ *
 * Generation options
 * ------------------------------------------------------------------ */

export type PageSizeName = "A4" | "Letter";

export interface GenerateOptions {
  pageSize?: PageSizeName | { width: number; height: number };
  margin?: number;
  footer?: boolean;
  pageNumbers?: boolean;
  title?: string;
}

export interface GenerateRequest {
  source: "template" | "html" | "markdown";
  templateId?: string;
  html?: string;
  markdown?: string;
  data?: Record<string, unknown>;
  options?: GenerateOptions;
}
