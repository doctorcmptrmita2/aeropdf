import { degrees, PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { AeroError } from "@aeropdf/shared";
import { assertPdfMagic, parseRange } from "./util.js";

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  assertPdfMagic(bytes);
  try {
    return await PDFDocument.load(bytes);
  } catch (e) {
    throw new AeroError("INVALID_PDF", `Could not load PDF: ${(e as Error).message}`);
  }
}

/** Merge several PDFs into one, preserving page order. */
export async function mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  if (pdfs.length === 0) throw new AeroError("VALIDATION_ERROR", "No files to merge");
  const out = await PDFDocument.create();
  for (const bytes of pdfs) {
    const src = await load(bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/** Split a PDF into multiple documents by 1-based page ranges (e.g. "1-2","3"). */
export async function splitPdf(bytes: Uint8Array, ranges: string[]): Promise<Uint8Array[]> {
  const src = await load(bytes);
  const total = src.getPageCount();
  const results: Uint8Array[] = [];
  for (const token of ranges) {
    const pages = parseRange(token, total).map((n) => n - 1);
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(src, pages);
    copied.forEach((p) => doc.addPage(p));
    results.push(await doc.save());
  }
  return results;
}

/** Delete 1-based page numbers. */
export async function deletePages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const doc = await load(bytes);
  const total = doc.getPageCount();
  const toRemove = [...new Set(pages)].sort((a, b) => b - a); // descending so indices stay valid
  for (const n of toRemove) {
    if (n < 1 || n > total) throw new AeroError("VALIDATION_ERROR", `Page ${n} out of range`);
    doc.removePage(n - 1);
  }
  if (doc.getPageCount() === 0) throw new AeroError("VALIDATION_ERROR", "Cannot delete all pages");
  return doc.save();
}

/** Rotate 1-based pages by a multiple of 90 degrees (added to current rotation). */
export async function rotatePages(bytes: Uint8Array, pages: number[], deg: number): Promise<Uint8Array> {
  if (deg % 90 !== 0) throw new AeroError("VALIDATION_ERROR", "Rotation must be a multiple of 90");
  const doc = await load(bytes);
  const all = doc.getPages();
  for (const n of pages) {
    const page = all[n - 1];
    if (!page) throw new AeroError("VALIDATION_ERROR", `Page ${n} out of range`);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + deg) % 360));
  }
  return doc.save();
}

/** Reorder pages given a full 1-based permutation of all pages. */
export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const src = await load(bytes);
  const total = src.getPageCount();
  const sorted = [...order].sort((a, b) => a - b);
  const expected = Array.from({ length: total }, (_, i) => i + 1);
  if (sorted.length !== total || sorted.some((v, i) => v !== expected[i])) {
    throw new AeroError("VALIDATION_ERROR", `order must be a permutation of 1..${total}`);
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, order.map((n) => n - 1));
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

/** Stamp page numbers in the footer (e.g. "1 / 5"). */
export async function addPageNumbers(
  bytes: Uint8Array,
  opts: { fontSize?: number; margin?: number } = {},
): Promise<Uint8Array> {
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = opts.fontSize ?? 10;
  const margin = opts.margin ?? 24;
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const label = `${i + 1} / ${pages.length}`;
    const w = font.widthOfTextAtSize(label, size);
    page.drawText(label, { x: width / 2 - w / 2, y: margin, size, font, color: rgb(0.4, 0.45, 0.55) });
  });
  return doc.save();
}

/** Lightweight info without fully trusting the input. */
export async function getInfo(bytes: Uint8Array): Promise<{ pages: number; sizeBytes: number }> {
  const doc = await load(bytes);
  return { pages: doc.getPageCount(), sizeBytes: bytes.byteLength };
}
