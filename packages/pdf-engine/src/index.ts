import type { OverlayWatermark } from "@aeropdf/shared";
import { applyOverlay } from "./overlay.js";

export { applyOverlay } from "./overlay.js";
export { mergePdfs, splitPdf, deletePages, rotatePages, reorderPages, addPageNumbers, getInfo } from "./pages.js";
export { fillForm, detectFormFields } from "./forms.js";
export { parseColor, decodeImage, parseRange, assertPdfMagic } from "./util.js";

/** Convenience wrapper: add a text watermark across pages. */
export async function addWatermark(
  bytes: Uint8Array,
  text: string,
  opts: Omit<OverlayWatermark, "type" | "text"> = {},
): Promise<Uint8Array> {
  return applyOverlay(bytes, [{ type: "add_watermark", text, ...opts }]);
}
