/* Live SDK smoke test — expects the API running on baseUrl. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AeroPDF } from "@aeropdf/sdk";

const baseUrl = process.env.AEROPDF_BASE_URL ?? "http://localhost:8080";
const client = new AeroPDF({ apiKey: process.env.AEROPDF_API_KEY ?? "local-dev-key", baseUrl });

test("generate → watermark → download via SDK", async () => {
  const gen = await client.pdf.generate({
    source: "template",
    templateId: "invoice-basic",
    data: { invoice_no: "SDK-1", customer: { name: "SDK Test" }, grand_total: 10 },
  });
  assert.equal(gen.success, true);
  assert.ok(gen.file_id.startsWith("file_"));

  const wm = await client.pdf.watermark(gen.file_id, "VIA SDK");
  assert.ok(wm.output_file_id);

  const bytes = await client.pdf.download(wm.output_file_id);
  assert.ok(bytes[0] === 0x25 && bytes[1] === 0x50); // %P
});

test("invalid key rejected", async () => {
  const bad = new AeroPDF({ apiKey: "wrong-key", baseUrl });
  await assert.rejects(() => bad.pdf.generate({ source: "template", templateId: "invoice-basic" }));
});
