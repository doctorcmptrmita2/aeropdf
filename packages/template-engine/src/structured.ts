import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { GenerateOptions } from "@aeropdf/shared";

const NAVY = rgb(0.055, 0.106, 0.239);
const BLUE = rgb(0.145, 0.388, 0.922);
const RED = rgb(0.957, 0.325, 0.302);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.886, 0.91, 0.941);

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
};

function resolveSize(opts?: GenerateOptions): [number, number] {
  const ps = opts?.pageSize;
  if (ps && typeof ps === "object") return [ps.width, ps.height];
  return PAGE_SIZES[ps ?? "A4"] ?? PAGE_SIZES.A4;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
  margin: number;
  y: number;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([ctx.width, ctx.height]);
  ctx.y = ctx.height - ctx.margin;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < ctx.margin) newPage(ctx);
}

function text(ctx: Ctx, s: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}): void {
  const size = opts.size ?? 11;
  ensureSpace(ctx, size + 6);
  ctx.page.drawText(s, {
    x: opts.x ?? ctx.margin,
    y: ctx.y,
    size,
    font: opts.bold ? ctx.bold : ctx.font,
    color: opts.color ?? NAVY,
  });
  ctx.y -= size + 6;
}

function brand(ctx: Ctx): void {
  ctx.page.drawText("AeroPDF", { x: ctx.margin, y: ctx.y, size: 20, font: ctx.bold, color: BLUE });
  const w = ctx.bold.widthOfTextAtSize("AeroPDF", 20);
  ctx.page.drawText(".dev", { x: ctx.margin + w, y: ctx.y, size: 20, font: ctx.bold, color: RED });
  ctx.y -= 34;
}

function row(ctx: Ctx, cells: string[], widths: number[], opts: { header?: boolean } = {}): void {
  const h = 22;
  ensureSpace(ctx, h);
  let x = ctx.margin;
  const top = ctx.y;
  if (opts.header) {
    ctx.page.drawRectangle({ x, y: top - h + 6, width: ctx.width - ctx.margin * 2, height: h, color: NAVY });
  }
  cells.forEach((c, i) => {
    ctx.page.drawText(String(c), {
      x: x + 6,
      y: top - h + 12,
      size: 10,
      font: opts.header ? ctx.bold : ctx.font,
      color: opts.header ? rgb(1, 1, 1) : NAVY,
    });
    x += widths[i];
  });
  ctx.y -= h;
  if (!opts.header) {
    ctx.page.drawLine({
      start: { x: ctx.margin, y: ctx.y + 4 },
      end: { x: ctx.width - ctx.margin, y: ctx.y + 4 },
      thickness: 0.5,
      color: LINE,
    });
  }
}

/**
 * Render a document directly with pdf-lib from data. This is the browser-free path so the
 * engine ALWAYS yields a valid PDF (PRD §8.1 "stable, repeatable output"). Picks a layout
 * from the data shape; `items`/`metrics` produce tables, otherwise a key/value sheet.
 */
export async function structuredPdf(
  data: Record<string, unknown>,
  options: GenerateOptions = {},
): Promise<Uint8Array> {
  const [width, height] = resolveSize(options);
  const margin = options.margin ?? 48;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage([width, height]), font, bold, width, height, margin, y: height - margin };

  brand(ctx);

  const title = (options.title as string) || (data.title as string) || (data.invoice_no ? `Invoice ${data.invoice_no}` : "Document");
  text(ctx, String(title), { size: 22, bold: true });
  if (data.invoice_date || data.date) text(ctx, String(data.invoice_date ?? data.date), { color: MUTED });
  ctx.y -= 8;

  // Customer / recipient block.
  const customer = data.customer as { name?: string; email?: string } | undefined;
  if (customer?.name) {
    text(ctx, `Bill to: ${customer.name}`, { bold: true });
    if (customer.email) text(ctx, customer.email, { color: MUTED });
  }
  if (data.recipient) text(ctx, `Recipient: ${data.recipient}`, { bold: true });
  if (data.summary) text(ctx, String(data.summary), { color: MUTED });
  if (data.description) text(ctx, String(data.description));
  ctx.y -= 8;

  // Line items table.
  const items = data.items as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(items) && items.length) {
    const colW = [ctx.width - margin * 2 - 240, 60, 90, 90];
    row(ctx, ["Item", "Qty", "Price", "Total"], colW, { header: true });
    let subtotal = 0;
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      const lineTotal = (it.total != null ? Number(it.total) : qty * price) || 0;
      subtotal += lineTotal;
      row(ctx, [String(it.name ?? ""), String(qty), price.toFixed(2), lineTotal.toFixed(2)], colW);
    }
    ctx.y -= 8;
    const grand = data.grand_total != null ? Number(data.grand_total) : subtotal;
    text(ctx, `Subtotal: ${subtotal.toFixed(2)}`, { x: ctx.width - margin - 200 });
    text(ctx, `Total: ${grand.toFixed(2)}`, { bold: true, size: 14, color: BLUE, x: ctx.width - margin - 200 });
  }

  // Metric table.
  const metrics = data.metrics as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(metrics) && metrics.length) {
    const colW = [ctx.width - margin * 2 - 160, 160];
    row(ctx, ["Metric", "Value"], colW, { header: true });
    for (const m of metrics) row(ctx, [String(m.label ?? ""), String(m.value ?? "")], colW);
  }

  if (options.pageNumbers) {
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      const label = `${i + 1} / ${pages.length}`;
      const w = font.widthOfTextAtSize(label, 9);
      p.drawText(label, { x: width / 2 - w / 2, y: 24, size: 9, font, color: MUTED });
    });
  }

  return doc.save();
}
