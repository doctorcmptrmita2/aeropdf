/* AeroPDF dashboard — talks to the live API with the bearer key from the top bar. */
(() => {
  const $ = (id) => document.getElementById(id);
  const apiKey = () => $("apiKey").value.trim();
  let activeFileId = null;
  let templates = [];

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { Authorization: `Bearer ${apiKey()}`, ...(opts.headers || {}) },
    });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
    return body;
  }

  function fmtBytes(n) {
    if (!n) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(n) / Math.log(1024));
    return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
  }

  function showResult(el, html, isErr) {
    el.className = "result" + (isErr ? " err" : "");
    el.innerHTML = html;
    el.classList.remove("hidden");
  }

  function setPreview(fileId) {
    const url = `/v1/files/${fileId}/download`;
    // The iframe can't send Authorization headers, so fetch as blob then show.
    fetch(url, { headers: { Authorization: `Bearer ${apiKey()}` } })
      .then((r) => r.blob())
      .then((b) => {
        $("preview").src = URL.createObjectURL(b);
        const dl = $("dlBtn");
        dl.href = URL.createObjectURL(b);
        dl.download = `${fileId}.pdf`;
        dl.classList.remove("hidden");
      })
      .catch(() => {});
  }

  /* ---------- health + stats ---------- */
  async function loadHealth() {
    try {
      const h = await fetch("/health").then((r) => r.json());
      $("htmlMode").textContent = `HTML→PDF: ${h.htmlToPdf ? "browser ✓" : "structured fallback"}`;
    } catch { /* ignore */ }
  }

  async function loadStats() {
    try {
      const { stats } = await api("/v1/stats");
      $("stGenerated").textContent = stats.filesGenerated.toLocaleString();
      $("stSuccess").textContent = `${stats.successRate}%`;
      $("stJobs").textContent = stats.totalJobs.toLocaleString();
      $("stStorage").textContent = fmtBytes(stats.storageBytes);
    } catch (e) { /* keep dashes */ }
  }

  /* ---------- templates ---------- */
  async function loadTemplates() {
    try {
      const { templates: t } = await api("/v1/templates");
      templates = t;
      const sel = $("tplSelect");
      sel.innerHTML = t.map((x) => `<option value="${x.id}">${x.name}</option>`).join("");
      loadSampleData();
    } catch (e) {
      $("tplSelect").innerHTML = `<option>API key invalid?</option>`;
    }
  }

  function loadSampleData() {
    const id = $("tplSelect").value;
    const tpl = templates.find((x) => x.id === id);
    if (tpl) $("tplData").value = JSON.stringify(tpl.sample_data, null, 2);
  }

  /* ---------- jobs + files ---------- */
  async function loadJobs() {
    try {
      const { jobs } = await api("/v1/jobs");
      const body = $("jobsBody");
      if (!jobs.length) return;
      body.innerHTML = jobs.slice(0, 8).map((j) => {
        const cls = j.status === "completed" ? "ok" : j.status === "failed" ? "fail" : "proc";
        const out = j.outputFileId || (j.outputFileIds ? `${j.outputFileIds.length} files` : "—");
        return `<tr><td><code>${j.id}</code></td><td>${j.type}</td>
          <td><span class="badge ${cls}">${j.status}</span></td><td>${out}</td></tr>`;
      }).join("");
    } catch { /* ignore */ }
  }

  async function loadFiles() {
    try {
      const { files } = await api("/v1/files");
      $("fileCount").textContent = `${files.length} file(s)`;
      const body = $("filesBody");
      if (!files.length) return;
      body.innerHTML = files.slice(0, 12).map((f) => `
        <tr>
          <td><code>${f.id}</code></td><td>${f.filename}</td><td>${f.source}</td>
          <td>${f.pages}</td><td>${fmtBytes(f.sizeBytes)}</td>
          <td><a href="#" data-id="${f.id}" class="useFile muted">use</a></td>
        </tr>`).join("");
      body.querySelectorAll(".useFile").forEach((a) =>
        a.addEventListener("click", (e) => {
          e.preventDefault();
          activeFileId = a.dataset.id;
          setPreview(activeFileId);
          showResult($("toolResult"), `Active file → <code>${activeFileId}</code>`);
        }),
      );
    } catch { /* ignore */ }
  }

  function refreshAll() { loadStats(); loadJobs(); loadFiles(); }

  /* ---------- actions ---------- */
  async function generate() {
    let data;
    try { data = JSON.parse($("tplData").value || "{}"); }
    catch { return showResult($("genResult"), "Invalid JSON in data field.", true); }
    showResult($("genResult"), "Generating…");
    try {
      const r = await api("/v1/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "template", templateId: $("tplSelect").value, data }),
      });
      activeFileId = r.file_id;
      showResult($("genResult"),
        `✓ Generated <b>${r.pages}</b> page(s), ${fmtBytes(r.size_bytes)} via <b>${r.renderer}</b> renderer.<br/>
         file: <code>${r.file_id}</code> · job: <code>${r.job_id}</code>`);
      setPreview(r.file_id);
      refreshAll();
    } catch (e) {
      showResult($("genResult"), e.message, true);
    }
  }

  async function upload() {
    const f = $("uploadFile").files[0];
    if (!f) return showResult($("toolResult"), "Choose a PDF first.", true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await api("/v1/pdf/upload", { method: "POST", body: fd });
      activeFileId = r.file_id;
      showResult($("toolResult"), `✓ Uploaded <code>${r.file_id}</code> (${r.pages} pages). It is now the active file.`);
      setPreview(r.file_id);
      refreshAll();
    } catch (e) { showResult($("toolResult"), e.message, true); }
  }

  async function watermark() {
    if (!activeFileId) return showResult($("toolResult"), "No active file. Generate or upload first.", true);
    const text = $("wmText").value.trim() || "CONFIDENTIAL";
    try {
      const r = await api("/v1/pdf/watermark", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: activeFileId, text }),
      });
      activeFileId = r.output_file_id;
      showResult($("toolResult"), `✓ Watermarked → <code>${r.output_file_id}</code>`);
      setPreview(r.output_file_id);
      refreshAll();
    } catch (e) { showResult($("toolResult"), e.message, true); }
  }

  async function stamp() {
    if (!activeFileId) return showResult($("toolResult"), "No active file. Generate or upload first.", true);
    try {
      const r = await api("/v1/pdf/edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: activeFileId,
          operations: [
            { type: "add_rect", page: 1, x: 60, y: 690, width: 170, height: 44, color: "#dcfce7", opacity: 0.9 },
            { type: "add_text", page: 1, x: 78, y: 704, text: "APPROVED", fontSize: 22, color: "#15803d" },
          ],
        }),
      });
      activeFileId = r.output_file_id;
      showResult($("toolResult"), `✓ Stamped → <code>${r.output_file_id}</code>`);
      setPreview(r.output_file_id);
      refreshAll();
    } catch (e) { showResult($("toolResult"), e.message, true); }
  }

  /* ---------- wire up ---------- */
  $("tplSelect").addEventListener("change", loadSampleData);
  $("loadSample").addEventListener("click", loadSampleData);
  $("genBtn").addEventListener("click", generate);
  $("uploadBtn").addEventListener("click", upload);
  $("wmBtn").addEventListener("click", watermark);
  $("stampBtn").addEventListener("click", stamp);
  $("refreshJobs").addEventListener("click", (e) => { e.preventDefault(); refreshAll(); });
  $("apiKey").addEventListener("change", () => { loadTemplates(); refreshAll(); });

  loadHealth();
  loadTemplates();
  refreshAll();
})();
