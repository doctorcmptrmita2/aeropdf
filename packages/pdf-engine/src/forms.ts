import { PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField } from "pdf-lib";
import { AeroError } from "@aeropdf/shared";
import { assertPdfMagic } from "./util.js";

/**
 * Fill AcroForm fields from a JSON map and optionally flatten (PRD §8.9).
 * Unknown field names are ignored so partial payloads are safe.
 */
export async function fillForm(
  bytes: Uint8Array,
  fields: Record<string, string | number | boolean>,
  flatten = false,
): Promise<Uint8Array> {
  assertPdfMagic(bytes);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch (e) {
    throw new AeroError("INVALID_PDF", `Could not load PDF: ${(e as Error).message}`);
  }

  const form = doc.getForm();
  const known = new Set(form.getFields().map((f) => f.getName()));

  for (const [name, value] of Object.entries(fields)) {
    if (!known.has(name)) continue;
    const field = form.getField(name);
    if (field instanceof PDFTextField) {
      field.setText(String(value));
    } else if (field instanceof PDFCheckBox) {
      if (value === true || value === "true" || value === 1) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup) {
      field.select(String(value));
    } else if (field instanceof PDFDropdown) {
      field.select(String(value));
    }
  }

  if (flatten) form.flatten();
  return doc.save();
}

/** Return the names of fillable fields in the PDF, empty if none. */
export async function detectFormFields(bytes: Uint8Array): Promise<string[]> {
  assertPdfMagic(bytes);
  try {
    const doc = await PDFDocument.load(bytes);
    return doc.getForm().getFields().map((f) => f.getName());
  } catch {
    return [];
  }
}
