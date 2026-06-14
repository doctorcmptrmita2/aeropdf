import Handlebars from "handlebars";
import { PDFDocument } from "pdf-lib";
import { AeroError, type GenerateRequest } from "@aeropdf/shared";
import { registerHelpers } from "./helpers.js";
import { getBuiltinTemplate } from "./templates.js";
import { structuredPdf } from "./structured.js";
import { htmlToPdf } from "./html-pdf.js";

export { BUILTIN_TEMPLATES, getBuiltinTemplate } from "./templates.js";
export { htmlPdfAvailable } from "./html-pdf.js";

const hbs = Handlebars.create();
registerHelpers(hbs);

/** Compile + execute a Handlebars template string. */
export function render(template: string, data: Record<string, unknown> = {}): string {
  try {
    return hbs.compile(template, { noEscape: false })(data);
  } catch (e) {
    throw new AeroError("TEMPLATE_RENDER_FAILED", `Template render failed: ${(e as Error).message}`);
  }
}

/** Minimal Markdown → HTML (headings, bold, lists, paragraphs) for the markdown source. */
function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (h) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
    } else if (line === "") {
      if (inList) { out.push("</ul>"); inList = false; }
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#0E1B3D;padding:48px;line-height:1.5}
    h1,h2,h3{color:#2563EB}</style></head><body>${out.join("")}</body></html>`;
  function inline(s: string): string {
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  try {
    return (await PDFDocument.load(bytes)).getPageCount();
  } catch {
    return 1;
  }
}

export interface GenerateResult {
  bytes: Uint8Array;
  pages: number;
  renderer: "browser" | "structured";
}

/**
 * Orchestrate generation per source type (PRD §8.1).
 *  - template: render HTML, then browser-PDF if available, else structured pdf-lib renderer
 *  - html / markdown: browser-PDF if available, else structured text renderer
 */
export async function generatePdf(req: GenerateRequest): Promise<GenerateResult> {
  const options = req.options ?? {};
  const data = req.data ?? {};

  let html: string | null = null;

  if (req.source === "template") {
    if (!req.templateId) throw new AeroError("VALIDATION_ERROR", "template_id is required for source=template");
    const tpl = getBuiltinTemplate(req.templateId);
    if (!tpl) throw new AeroError("TEMPLATE_NOT_FOUND", `Template "${req.templateId}" not found`);
    html = render(tpl.html, data);
  } else if (req.source === "html") {
    if (!req.html) throw new AeroError("VALIDATION_ERROR", "html is required for source=html");
    html = render(req.html, data);
  } else if (req.source === "markdown") {
    if (!req.markdown) throw new AeroError("VALIDATION_ERROR", "markdown is required for source=markdown");
    html = markdownToHtml(render(req.markdown, data));
  } else {
    throw new AeroError("VALIDATION_ERROR", `Unknown source "${(req as { source: string }).source}"`);
  }

  // Try the browser path first for fidelity.
  const browserPdf = await htmlToPdf(html, options);
  if (browserPdf) {
    return { bytes: browserPdf, pages: await pageCount(browserPdf), renderer: "browser" };
  }

  // Browser-free fallback: structured renderer from data (templates) or stripped text.
  const fallbackData =
    req.source === "template" || Object.keys(data).length
      ? data
      : { title: options.title ?? "Document", summary: stripTags(html) };
  const bytes = await structuredPdf(fallbackData, options);
  return { bytes, pages: await pageCount(bytes), renderer: "structured" };
}

function stripTags(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
}
