import { rgb, type RGB } from "pdf-lib";
import { AeroError } from "@aeropdf/shared";

/** Parse `#rrggbb` (or `#rgb`) into a pdf-lib RGB color. Defaults to black. */
export function parseColor(hex?: string): RGB {
  if (!hex) return rgb(0, 0, 0);
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return rgb(0, 0, 0);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/** Decode base64 (optionally a data: URL) into bytes and detect png/jpg. */
export function decodeImage(input: string): { bytes: Uint8Array; kind: "png" | "jpg" } {
  let b64 = input;
  let kind: "png" | "jpg" | undefined;
  const m = /^data:image\/(png|jpe?g);base64,/i.exec(input);
  if (m) {
    kind = m[1].toLowerCase().startsWith("png") ? "png" : "jpg";
    b64 = input.slice(m[0].length);
  }
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  if (!kind) {
    // Sniff magic bytes.
    if (bytes[0] === 0x89 && bytes[1] === 0x50) kind = "png";
    else if (bytes[0] === 0xff && bytes[1] === 0xd8) kind = "jpg";
    else throw new AeroError("UNSUPPORTED_OPERATION", "Image must be PNG or JPEG");
  }
  return { bytes, kind };
}

/** Parse a range token like "1-3" or "5" into 1-based page indices. */
export function parseRange(token: string, totalPages: number): number[] {
  const t = token.trim();
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(t);
  if (range) {
    const start = parseInt(range[1], 10);
    const end = parseInt(range[2], 10);
    if (start < 1 || end > totalPages || start > end) {
      throw new AeroError("VALIDATION_ERROR", `Invalid range "${token}" for ${totalPages} pages`);
    }
    const out: number[] = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }
  const single = /^(\d+)$/.exec(t);
  if (single) {
    const n = parseInt(single[1], 10);
    if (n < 1 || n > totalPages) {
      throw new AeroError("VALIDATION_ERROR", `Page ${n} out of range (1-${totalPages})`);
    }
    return [n];
  }
  throw new AeroError("VALIDATION_ERROR", `Unparseable range token "${token}"`);
}

/** Guard: throw INVALID_PDF unless the buffer starts with the %PDF magic. */
export function assertPdfMagic(bytes: Uint8Array): void {
  const ok = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!ok) throw new AeroError("INVALID_PDF", "File is not a valid PDF (missing %PDF header)");
}
