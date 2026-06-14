import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import { AeroError, type OverlayOp } from "@aeropdf/shared";
import { parseColor, decodeImage, assertPdfMagic } from "./util.js";

/**
 * Apply overlay operations on top of an existing PDF WITHOUT rewriting its content
 * (PRD §8.5). This is the only sanctioned way to edit external PDFs in the MVP.
 */
export async function applyOverlay(pdfBytes: Uint8Array, ops: OverlayOp[]): Promise<Uint8Array> {
  assertPdfMagic(pdfBytes);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBytes);
  } catch (e) {
    throw new AeroError("INVALID_PDF", `Could not load PDF: ${(e as Error).message}`);
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();

  const pageAt = (n: number) => {
    const p = pages[n - 1];
    if (!p) throw new AeroError("VALIDATION_ERROR", `Page ${n} does not exist (1-${pages.length})`);
    return p;
  };

  for (const op of ops) {
    switch (op.type) {
      case "add_text": {
        const page = pageAt(op.page);
        page.drawText(op.text, {
          x: op.x,
          y: op.y,
          size: op.fontSize ?? 14,
          font,
          color: parseColor(op.color),
          rotate: degrees(op.rotation ?? 0),
          opacity: op.opacity ?? 1,
        });
        break;
      }
      case "add_image":
      case "add_signature": {
        const page = pageAt(op.page);
        const { bytes, kind } = decodeImage(op.imageBase64);
        const img = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        page.drawImage(img, {
          x: op.x,
          y: op.y,
          width: op.width,
          height: op.height,
          opacity: op.opacity ?? 1,
        });
        break;
      }
      case "add_watermark": {
        const targets = op.pages && op.pages.length > 0 ? op.pages.map(pageAt) : pages;
        const size = op.fontSize ?? 48;
        for (const page of targets) {
          const { width, height } = page.getSize();
          const textWidth = fontBold.widthOfTextAtSize(op.text, size);
          page.drawText(op.text, {
            x: width / 2 - textWidth / 2,
            y: height / 2,
            size,
            font: fontBold,
            color: parseColor(op.color ?? "#9aa3b2"),
            rotate: degrees(op.rotation ?? -35),
            opacity: op.opacity ?? 0.15,
          });
        }
        break;
      }
      case "add_rect": {
        const page = pageAt(op.page);
        page.drawRectangle({
          x: op.x,
          y: op.y,
          width: op.width,
          height: op.height,
          color: parseColor(op.color),
          opacity: op.opacity ?? 1,
        });
        break;
      }
      case "add_line": {
        const page = pageAt(op.page);
        page.drawLine({
          start: { x: op.x1, y: op.y1 },
          end: { x: op.x2, y: op.y2 },
          thickness: op.thickness ?? 1,
          color: parseColor(op.color),
        });
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new AeroError("UNSUPPORTED_OPERATION", `Unknown operation: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  return doc.save();
}
