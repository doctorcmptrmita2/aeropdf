import type { GenerateOptions } from "@aeropdf/shared";

let cachedAvailable: boolean | null = null;

/** Detect whether Puppeteer + a browser are usable (cached). */
export async function htmlPdfAvailable(): Promise<boolean> {
  if (process.env.ENABLE_HTML_PDF === "off") return false;
  if (cachedAvailable !== null) return cachedAvailable;
  try {
    const mod = await import("puppeteer");
    // Resolving an executable path throws if no browser is installed.
    const exec = (mod.default as { executablePath?: () => string }).executablePath?.();
    cachedAvailable = typeof exec === "string" && exec.length > 0;
  } catch {
    cachedAvailable = false;
  }
  return cachedAvailable;
}

/**
 * High-fidelity HTML→PDF using a headless browser. Returns null when unavailable so callers
 * can fall back to the structured renderer. Honors a hard render timeout (PRD §15).
 */
export async function htmlToPdf(html: string, options: GenerateOptions = {}): Promise<Uint8Array | null> {
  if (!(await htmlPdfAvailable())) return null;
  const { default: puppeteer } = await import("puppeteer");
  const timeout = Number(process.env.RENDER_TIMEOUT_MS ?? 60000);
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout });
    const margin = `${options.margin ?? 36}px`;
    const format = typeof options.pageSize === "string" ? options.pageSize : "A4";
    const pdf = await page.pdf({
      format: format as "A4" | "Letter",
      printBackground: true,
      margin: { top: margin, bottom: margin, left: margin, right: margin },
      displayHeaderFooter: Boolean(options.pageNumbers),
      footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;color:#64748B"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      headerTemplate: "<div></div>",
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
