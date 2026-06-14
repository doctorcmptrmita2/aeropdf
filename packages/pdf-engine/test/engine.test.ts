import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePdf } from "@aeropdf/template-engine";
import { applyOverlay, mergePdfs, splitPdf, deletePages, addWatermark, getInfo } from "@aeropdf/pdf-engine";

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

test("generate invoice from template", async () => {
  const r = await generatePdf({ source: "template", templateId: "invoice-basic", data: {
    invoice_no: "INV-9", customer: { name: "Acme" },
    items: [{ name: "X", quantity: 2, price: 10 }], grand_total: 20,
  } });
  assert.ok(isPdf(r.bytes));
  assert.ok(r.pages >= 1);
});

test("overlay text + watermark on generated pdf", async () => {
  const base = await generatePdf({ source: "template", templateId: "report-basic", data: {} });
  const edited = await applyOverlay(base.bytes, [
    { type: "add_text", page: 1, x: 50, y: 50, text: "Hello", fontSize: 12 },
    { type: "add_watermark", text: "DRAFT" },
  ]);
  assert.ok(isPdf(edited));
});

test("merge then split round-trips page counts", async () => {
  const a = (await generatePdf({ source: "template", templateId: "invoice-basic", data: {} })).bytes;
  const b = (await generatePdf({ source: "template", templateId: "certificate-basic", data: {} })).bytes;
  const merged = await mergePdfs([a, b]);
  const info = await getInfo(merged);
  assert.ok(info.pages >= 2);
  const parts = await splitPdf(merged, ["1", "2"]);
  assert.equal(parts.length, 2);
});

test("watermark + delete page guards", async () => {
  const a = (await generatePdf({ source: "template", templateId: "invoice-basic", data: {} })).bytes;
  const wm = await addWatermark(a, "CONFIDENTIAL", { opacity: 0.2 });
  assert.ok(isPdf(wm));
  await assert.rejects(() => deletePages(a, [1]), /Cannot delete all pages/);
});
