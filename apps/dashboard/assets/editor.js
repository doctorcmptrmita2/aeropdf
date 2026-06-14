/* AeroPDF visual editor — PDF.js preview + server-side overlay/page operations. */
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

const $ = (id) => document.getElementById(id);
const KEY = "aeropdf_key";
const apiKey = () => $("apiKey").value.trim();
// Restore the key saved in Settings so it persists across pages.
const savedKey = localStorage.getItem(KEY);
if (savedKey) $("apiKey").value = savedKey;

let activeFileId = null;
let pdfDoc = null;
let curPage = 1;
let numPages = 0;
let scale = 1.3;
let tool = "none";
let sigDataUrl = null;
let templates = [];

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { Authorization: `Bearer ${apiKey()}`, ...(opts.headers || {}) } });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
  return body;
}
const jsonPost = (path, payload) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

function showResult(html, isErr) {
  // Write to the always-visible top status banner AND the side panel (when present).
  for (const id of ["edStatus", "edResult"]) {
    const el = $(id);
    if (!el) continue;
    el.className = "result" + (isErr ? " err" : "");
    el.innerHTML = html;
    el.classList.remove("hidden");
  }
}

async function fetchBlob(fileId) {
  const r = await fetch(`/v1/files/${fileId}/download`, { headers: { Authorization: `Bearer ${apiKey()}` } });
  if (!r.ok) throw new Error("download failed");
  return r.blob();
}

async function loadActive(fileId, keepPage) {
  try {
    activeFileId = fileId;
    const blob = await fetchBlob(fileId);
    const buf = await blob.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    numPages = pdfDoc.numPages;
    if (!keepPage || curPage > numPages) curPage = Math.min(curPage || 1, numPages);
    $("edEmpty").classList.add("hidden");
    $("edMain").classList.remove("hidden");
    const dl = $("dlBtn");
    dl.classList.remove("hidden");
    dl.href = URL.createObjectURL(blob);
    dl.download = `${fileId}.pdf`;
    $("fileInfo").textContent = `${fileId} · ${numPages} sayfa`;
    await renderThumbs();
    await renderPage(curPage);
  } catch (e) {
    showResult(e.message, true);
  }
}

async function renderPage(n) {
  curPage = n;
  const page = await pdfDoc.getPage(n);
  const vp = page.getViewport({ scale });
  const canvas = $("edCanvas");
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  $("pageLabel").textContent = `Page ${n} / ${numPages}`;
  document.querySelectorAll(".ed-thumb").forEach((t, i) => t.classList.toggle("active", i + 1 === n));
}

async function renderThumbs() {
  const wrap = $("edThumbs");
  wrap.innerHTML = "";
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale: 0.22 });
    const div = document.createElement("div");
    div.className = "ed-thumb" + (i === curPage ? " active" : "");
    const c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    div.appendChild(c);
    div.insertAdjacentHTML("beforeend",
      `<span class="n">${i}</span>
       <div class="ops">
         <button title="Rotate" data-act="rotate" data-p="${i}">⟳</button>
         <button title="Delete" data-act="delete" data-p="${i}">🗑</button>
       </div>`);
    div.querySelector("canvas").addEventListener("click", () => renderPage(i));
    wrap.appendChild(div);
  }
  wrap.querySelectorAll(".ops button").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const p = Number(b.dataset.p);
      try {
        if (b.dataset.act === "rotate") {
          const r = await jsonPost("/v1/pdf/pages", { file_id: activeFileId, operation: "rotate", pages: [p], degrees: 90 });
          await loadActive(r.output_file_id, true);
        } else {
          if (numPages <= 1) return showResult("Tek sayfa silinemez.", true);
          const r = await jsonPost("/v1/pdf/pages", { file_id: activeFileId, operation: "delete", pages: [p] });
          if (curPage > p) curPage--;
          await loadActive(r.output_file_id, true);
        }
        showResult(`✓ ${b.dataset.act} → <code>${activeFileId}</code>`);
      } catch (err) { showResult(err.message, true); }
    }),
  );
}

/* ---- coordinate mapping: canvas pixel → PDF point (origin bottom-left) ---- */
function toPdfCoords(e) {
  const canvas = $("edCanvas");
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x: px / scale, y: (canvas.height - py) / scale };
}

async function applyOps(ops) {
  try {
    const r = await jsonPost("/v1/pdf/edit", { file_id: activeFileId, operations: ops });
    await loadActive(r.output_file_id, true);
    showResult(`✓ uygulandı → <code>${r.output_file_id}</code>`);
  } catch (e) { showResult(e.message, true); }
}

async function onCanvasClick(e) {
  if (!activeFileId || tool === "none") return;
  const { x, y } = toPdfCoords(e);
  if (tool === "text") {
    const t = prompt("Metin:");
    if (t) await applyOps([{ type: "add_text", page: curPage, x, y, text: t, fontSize: 16, color: "#111111" }]);
  } else if (tool === "stamp") {
    await applyOps([
      { type: "add_rect", page: curPage, x: x - 6, y: y - 6, width: 150, height: 40, color: "#dcfce7", opacity: 0.9 },
      { type: "add_text", page: curPage, x: x + 10, y: y + 8, text: "APPROVED", fontSize: 20, color: "#15803d" },
    ]);
  } else if (tool === "rect") {
    await applyOps([{ type: "add_rect", page: curPage, x, y: y - 60, width: 150, height: 60, color: "#2563EB", opacity: 0.18 }]);
  } else if (tool === "signature") {
    if (!sigDataUrl) { openSig(); return; }
    try {
      const r = await jsonPost("/v1/pdf/sign", {
        file_id: activeFileId, image_base64: sigDataUrl, page: curPage, x, y: y - 35, width: 160, height: 70,
      });
      await loadActive(r.output_file_id, true);
      showResult(`✓ imza yerleştirildi → <code>${r.output_file_id}</code>`);
    } catch (err) { showResult(err.message, true); }
  }
}

/* ---- signature pad ---- */
let drawing = false;
function setupSigPad() {
  const c = $("sigPad");
  const ctx = c.getContext("2d");
  ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0E1B3D";
  const pos = (ev) => { const r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (c.width / r.width), y: (ev.clientY - r.top) * (c.height / r.height) }; };
  c.addEventListener("pointerdown", (ev) => { drawing = true; const p = pos(ev); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  c.addEventListener("pointermove", (ev) => { if (!drawing) return; const p = pos(ev); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  window.addEventListener("pointerup", () => { drawing = false; });
  $("sigClear").addEventListener("click", () => ctx.clearRect(0, 0, c.width, c.height));
  $("sigCancel").addEventListener("click", () => $("sigModal").classList.remove("show"));
  $("sigUse").addEventListener("click", () => {
    sigDataUrl = c.toDataURL("image/png");
    $("sigModal").classList.remove("show");
    setTool("signature");
    $("edHint").textContent = "İmza hazır — yerleştirmek için sayfaya tıkla.";
  });
}
function openSig() { $("sigModal").classList.add("show"); }

/* ---- tools ---- */
function setTool(t) {
  tool = t;
  document.querySelectorAll(".ed-tool[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
  const hints = {
    none: "Bir araç seç, sonra sayfaya tıklayarak yerleştir.",
    text: "Sayfaya tıkla → metni gir.",
    signature: sigDataUrl ? "Yerleştirmek için sayfaya tıkla." : "Sayfaya tıkla → imza çiz.",
    stamp: "Sayfaya tıkla → APPROVED damgası.",
    rect: "Sayfaya tıkla → kutu çiz.",
  };
  $("edHint").textContent = hints[t] || "";
}

/* ---- templates + upload ---- */
async function loadTemplates() {
  try {
    const { templates: t } = await api("/v1/templates");
    templates = t;
    $("tplSelect").innerHTML = t.map((x) => `<option value="${x.id}">${x.name}</option>`).join("");
  } catch (e) {
    showResult(`API anahtarı geçersiz görünüyor — sağ üstteki alana doğru <b>AEROPDF_API_KEY</b> değerini gir. (${e.message})`, true);
  }
}

async function generate() {
  try {
    const id = $("tplSelect").value;
    const tpl = templates.find((x) => x.id === id);
    const r = await jsonPost("/v1/pdf/generate", { source: "template", templateId: id, data: tpl?.sample_data || {} });
    curPage = 1;
    await loadActive(r.file_id);
    showResult(`✓ üretildi → <code>${r.file_id}</code>`);
  } catch (e) { showResult(e.message, true); }
}

async function upload() {
  const f = $("uploadFile").files[0];
  if (!f) return showResult("Önce bir PDF seç.", true);
  try {
    const fd = new FormData();
    fd.append("file", f);
    const r = await api("/v1/pdf/upload", { method: "POST", body: fd });
    curPage = 1;
    await loadActive(r.file_id);
    showResult(`✓ yüklendi → <code>${r.file_id}</code>`);
  } catch (e) { showResult(e.message, true); }
}

/* ---- wire up ---- */
document.querySelectorAll(".ed-tool[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
$("edCanvas").addEventListener("click", onCanvasClick);
$("prevPage").addEventListener("click", () => curPage > 1 && renderPage(curPage - 1));
$("nextPage").addEventListener("click", () => curPage < numPages && renderPage(curPage + 1));
$("uploadBtn").addEventListener("click", upload);
$("genBtn").addEventListener("click", generate);
$("wmBtn").addEventListener("click", async () => {
  if (!activeFileId) return showResult("Önce bir PDF aç.", true);
  const t = prompt("Filigran metni:", "CONFIDENTIAL");
  if (t) { try { const r = await jsonPost("/v1/pdf/watermark", { file_id: activeFileId, text: t }); await loadActive(r.output_file_id, true); showResult("✓ filigran eklendi"); } catch (e) { showResult(e.message, true); } }
});
$("numBtn").addEventListener("click", async () => {
  if (!activeFileId) return showResult("Önce bir PDF aç.", true);
  try { const r = await jsonPost("/v1/pdf/pages", { file_id: activeFileId, operation: "number" }); await loadActive(r.output_file_id, true); showResult("✓ sayfa numaraları eklendi"); } catch (e) { showResult(e.message, true); }
});
$("apiKey").addEventListener("change", () => { localStorage.setItem(KEY, apiKey()); loadTemplates(); });

setupSigPad();
loadTemplates();
