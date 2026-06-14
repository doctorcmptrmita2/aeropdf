# AeroPDF.dev — Technical Specifications

Technical "how" companion to [proje.md](proje.md). This describes the concrete MVP that lives
in this repository: a TypeScript monorepo with a Fastify API, a pure-JS PDF engine (pdf-lib),
a Handlebars template engine, a static branded dashboard/landing, a Node SDK and Docker self-host.

---

## 1. Repository Layout

```
000000AeroPDFMotoruX/
├─ package.json                 # npm workspaces root, scripts
├─ tsconfig.base.json           # shared strict TS config
├─ proje.md                     # product doc (TR)
├─ Specs.md                     # this file
├─ apps/
│  ├─ api/                      # Fastify REST API + static hosting
│  │  ├─ src/
│  │  │  ├─ server.ts           # app factory + start
│  │  │  ├─ config.ts           # env-based config
│  │  │  ├─ store.ts            # in-memory job/file/key store + local storage
│  │  │  ├─ auth.ts             # API-key bearer auth hook
│  │  │  └─ routes/
│  │  │     ├─ health.ts
│  │  │     ├─ pdf.ts           # generate/upload/edit/merge/split/watermark/fill-form
│  │  │     ├─ jobs.ts
│  │  │     └─ files.ts
│  │  └─ package.json
│  └─ dashboard/                # static landing + dashboard (served by API)
│     ├─ index.html             # landing (concept 05/03)
│     ├─ dashboard.html         # dashboard (concept 06)
│     └─ assets/
│        ├─ styles.css          # brand tokens + components
│        ├─ app.js              # dashboard live API calls
│        └─ logo.svg
├─ packages/
│  ├─ shared/                   # types + error system (AeroError, codes)
│  ├─ pdf-engine/               # pdf-lib operations
│  ├─ template-engine/          # Handlebars render + built-in templates
│  └─ sdk-node/                 # Node.js client
├─ docker/
│  ├─ Dockerfile
│  └─ docker-compose.yml
└─ docs/
   └─ README.md
```

---

## 2. Tech Stack & Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript (strict) | PRD rule 7 |
| Runtime | Node.js ≥ 20 (built with 22) | native `fetch`, ESM |
| API framework | Fastify | fast, schema-friendly, low overhead |
| PDF ops | `pdf-lib` | pure JS, no native deps → runs anywhere, deterministic |
| Template render | `handlebars` | loops/conditionals/helpers per PRD §8.2 |
| HTML→PDF | `puppeteer` (optional, lazy) | true HTML rendering when Chromium present; graceful fallback otherwise |
| IDs | `nanoid` | short, collision-safe |
| Validation | hand-rolled guards + Fastify schemas | minimal deps (PRD rule 5) |
| Storage | local FS (default) / S3-compatible (env) | self-host first |
| Module system | ESM (`"type": "module"`) | modern Node |
| Dev runner | `tsx` | run TS without a build step |

**Key product rule enforced in code:** external PDFs are edited via **overlay operations**
(`packages/pdf-engine/src/overlay.ts`) and **page operations**; AeroPDF-native documents are
edited via **template + data regeneration** (`packages/template-engine`). No Word-like reflow.

---

## 3. Shared Types & Errors (`packages/shared`)

### 3.1 Error system

```ts
class AeroError extends Error {
  code: ErrorCode;          // string union, see below
  statusCode: number;       // HTTP status
  details?: Record<string, unknown>;
}
```

Standard error response (PRD §16.1):

```json
{
  "success": false,
  "error": { "code": "PDF_RENDER_FAILED", "message": "...", "details": { } }
}
```

Error codes (PRD §16.2): `INVALID_API_KEY`, `FILE_TOO_LARGE`, `INVALID_PDF`,
`PDF_PASSWORD_REQUIRED`, `PDF_PASSWORD_INVALID`, `PDF_RENDER_FAILED`, `HTML_RENDER_TIMEOUT`,
`TEMPLATE_NOT_FOUND`, `TEMPLATE_RENDER_FAILED`, `FONT_LOAD_FAILED`, `STORAGE_ERROR`,
`JOB_NOT_FOUND`, `FILE_NOT_FOUND`, `RATE_LIMIT_EXCEEDED`, `UNSUPPORTED_OPERATION`,
`VALIDATION_ERROR`.

### 3.2 Core entities (per PRD §13)

`User`, `ApiKey`, `Template`, `FileRecord`, `Job`, `EditOperation`, plus the overlay
`OverlayObject` model (PRD §8.5):

```ts
type OverlayOp =
  | { type: "add_text"; page: number; x: number; y: number; text: string;
      fontSize?: number; color?: string; rotation?: number; opacity?: number }
  | { type: "add_image"; page: number; x: number; y: number; width: number;
      height: number; imageBase64: string }      // png/jpg data
  | { type: "add_signature"; page: number; x: number; y: number; width: number;
      height: number; imageBase64: string }
  | { type: "add_watermark"; text: string; opacity?: number; rotation?: number;
      color?: string; pages?: number[] }
  | { type: "add_rect"; page: number; x: number; y: number; width: number;
      height: number; color?: string; opacity?: number }
  | { type: "add_line"; page: number; x1: number; y1: number; x2: number;
      y2: number; color?: string; thickness?: number };
```

Coordinates are PDF points, origin bottom-left (pdf-lib convention), documented in the SDK.

---

## 4. PDF Engine (`packages/pdf-engine`)

Pure functions over `Uint8Array`/`Buffer`, all returning a PDF byte array. Deterministic
(PRD rule 11).

| Function | Signature (summary) | Notes |
|----------|--------------------|-------|
| `applyOverlay` | `(pdf, ops: OverlayOp[]) => Uint8Array` | text/image/signature/watermark/shape overlay |
| `mergePdfs` | `(pdfs: Uint8Array[]) => Uint8Array` | copies pages in order |
| `splitPdf` | `(pdf, ranges: string[]) => Uint8Array[]` | `"1-2"`, `"3"`, `"4-6"` |
| `deletePages` | `(pdf, pages: number[]) => Uint8Array` | 1-based |
| `rotatePages` | `(pdf, pages: number[], degrees) => Uint8Array` | 90/180/270 |
| `reorderPages` | `(pdf, order: number[]) => Uint8Array` | full permutation |
| `addWatermark` | `(pdf, text, opts) => Uint8Array` | convenience wrapper |
| `fillForm` | `(pdf, fields, flatten) => Uint8Array` | AcroForm text/checkbox |
| `addPageNumbers` | `(pdf, opts) => Uint8Array` | footer numbering |
| `getInfo` | `(pdf) => { pages, sizeBytes }` | parse metadata |

Color parsing accepts `#rrggbb`. Fonts: Standard 14 (Helvetica family) embedded by pdf-lib;
custom font embedding is a Phase-2 extension point.

---

## 5. Template Engine (`packages/template-engine`)

- `render(html: string, data): string` — Handlebars compile + execute with helpers:
  `formatCurrency`, `formatDate`, `formatNumber`, `eq`, `gt`, `sum`, `multiply`.
- Built-in templates (PRD §5.3): `invoice-basic`, `report-basic`, `certificate-basic`.
  Each is an HTML string with `{{ }}` + `{{#each}}` blocks and sample data.
- `templateToPdf(templateId | html, data, options)`:
  1. render HTML
  2. if Puppeteer + Chromium available → high-fidelity HTML→PDF
  3. else → structured renderer draws the document directly with pdf-lib
     (header, key/values, dynamic line-item table, totals, footer) so the engine
     **always produces a valid PDF** even with no browser.

Options: `pageSize` (`A4`|`Letter`|`{width,height}`), `margin`, `footer`, `pageNumbers`.

---

## 6. API (`apps/api`)

### 6.1 Server

Fastify with `@fastify/multipart` (uploads), `@fastify/static` (serve dashboard),
`@fastify/cors`. Global error handler maps `AeroError` → standard JSON; unknown errors → 500
`PDF_RENDER_FAILED`/`INTERNAL`. Request body limit from `MAX_UPLOAD_MB` (default 50).

### 6.2 Auth (`auth.ts`)

`preHandler` on `/v1/*`: reads `Authorization: Bearer <key>`, compares against configured key
hash(es). A default dev key is seeded from `AEROPDF_API_KEY` (default `local-dev-key`). Missing/
invalid → 401 `INVALID_API_KEY`. The dashboard uses the same key from a settings field.

### 6.3 Endpoints

All write endpoints create a `Job` record (synchronous completion in MVP; async/queue is a
Phase-2 extension point). Responses follow PRD §10.

| Method | Path | Body | Result |
|--------|------|------|--------|
| GET  | `/health` | — | `{ status, version, uptime, htmlToPdf }` |
| POST | `/v1/pdf/generate` | `{ source, template_id?, html?, markdown?, data?, options? }` | `{ success, job_id, file_id, download_url, pages, size_bytes }` |
| POST | `/v1/pdf/upload` | multipart `file` | `{ success, file_id, pages, size_bytes }` |
| POST | `/v1/pdf/edit` | `{ file_id, operations: OverlayOp[] }` | `{ success, job_id, output_file_id, download_url }` |
| POST | `/v1/pdf/merge` | `{ files: string[] }` | `{ success, job_id, output_file_id, download_url }` |
| POST | `/v1/pdf/split` | `{ file_id, ranges: string[] }` | `{ success, job_id, output_file_ids[], download_urls[] }` |
| POST | `/v1/pdf/watermark` | `{ file_id, text, opacity?, rotation? }` | `{ success, output_file_id, download_url }` |
| POST | `/v1/pdf/fill-form` | `{ file_id, fields, flatten? }` | `{ success, output_file_id, download_url }` |
| GET  | `/v1/jobs/:id` | — | `{ job_id, status, progress, output_file_id, error }` |
| GET  | `/v1/files/:id/download` | — | PDF binary (`application/pdf`) |
| GET  | `/v1/files` | — | list file records (dashboard) |
| DELETE | `/v1/files/:id` | — | `{ success }` |

`source` ∈ `template | html | markdown`. `download_url` is absolute, built from request host.

### 6.4 Store (`store.ts`)

Disk-backed `Map`s for jobs/files + on-disk blob storage under `STORAGE_PATH` (default
`./aeropdf-data`). Blobs are written as `<id>.pdf`; the file/job index is persisted to
`STORAGE_PATH/_index.json` after every mutation and reloaded on startup, so **metadata survives
restarts** as long as `STORAGE_PATH` is durable (a mounted volume). On load, file records whose
blob is missing are pruned; job history is capped at 300. File records hold `{ id, filename,
source, pages, sizeBytes, storagePath, createdAt }`. The interface stays narrow so a Postgres +
S3 driver can replace it behind it (Phase-2). `getStats()` powers the dashboard cards.

---

## 7. Dashboard & Landing (`apps/dashboard`)

Static, dependency-free, served by the API. Brand tokens in `assets/styles.css`:

```css
--navy:#0E1B3D; --primary:#2563EB; --accent:#3B82F6; --pdf:#F4534D;
--bg:#F6F8FC; --surface:#FFFFFF; --text:#0E1B3D; --muted:#64748B;
--radius:14px; --shadow:0 10px 30px rgba(14,27,61,.08);
```

- **`index.html`** — landing matching concept 05/03: sticky nav with SVG logo, hero
  "The PDF API for **Developers**", primary/secondary CTAs, feature cards (Generate, Edit &
  Annotate, Sign, Automate, Self-host), a live code sample, footer.
- **`dashboard.html`** — matching concept 06: left sidebar (Dashboard, Templates, PDF Editor,
  Files, API Keys, Logs, Webhooks, Settings), top bar, stat cards (PDFs generated, success rate,
  avg time, storage), recent jobs table, and a working **PDF playground**: pick template →
  enter JSON → generate → preview/download via the real API.
- **`assets/app.js`** — calls the API with the bearer key, renders stats, lists files, runs the
  generate/merge/watermark playground, shows results inline. No framework, no build.

---

## 8. SDK (`packages/sdk-node`)

```ts
import { AeroPDF } from "@aeropdf/sdk";
const client = new AeroPDF({ apiKey: process.env.AEROPDF_API_KEY, baseUrl });
const r = await client.pdf.generate({ source: "template", templateId: "invoice-basic", data });
console.log(r.download_url);
// also: client.pdf.upload(bytes), .edit(), .merge(), .split(), .watermark(), .fillForm(), .jobs.get()
```

Thin wrapper over `fetch`; throws `AeroError`-shaped errors on non-2xx.

---

## 9. Configuration (env)

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | bind address |
| `AEROPDF_API_KEY` | `local-dev-key` | seed API key |
| `STORAGE_DRIVER` | `local` | `local` \| `s3` |
| `STORAGE_PATH` | `./aeropdf-data` | local blob dir |
| `MAX_UPLOAD_MB` | `50` | upload limit |
| `RENDER_TIMEOUT_MS` | `60000` | HTML render timeout |
| `ENABLE_HTML_PDF` | `auto` | force Puppeteer on/off/auto-detect |

---

## 10. Docker Self-Host (`docker/`)

`Dockerfile`: `node:22-slim`, non-root user, installs deps, copies repo, exposes 8080, runs API.
`docker-compose.yml`: `aeropdf` service + optional `postgres:16` and `redis:7` (commented as
Phase-2 wiring), local volume mount to `/data`.

```bash
docker compose -f docker/docker-compose.yml up --build
# → http://localhost:8080
```

---

## 11. Security (mapped to PRD §14)

- Upload: magic-byte check (`%PDF`) rejects non-PDF; size limited by `MAX_UPLOAD_MB`.
- API: bearer key required on `/v1/*`; keys compared via constant-time hash compare.
- Processing: pdf-lib parsing is in-process and sandbox-friendly; HTML render runs with a hard
  timeout; remote asset fetching disabled by default (SSRF guard) when Puppeteer is used.
- Storage: blobs live under a private path; downloads go through the authenticated API.
- Self-host: secrets via env, non-root container user, private volume.

---

## 12. Performance Targets (PRD §15)

Small PDF < 3s, medium report < 8s, upload parse < 5s, async job ack < 500ms (sync path used in
MVP for small docs), worker timeout 60s, max upload 50MB. The pure-JS engine keeps memory well
under the 1GB self-host target for normal workloads.

---

## 13. Acceptance Criteria Coverage (PRD §22)

- **Generation:** valid PDF, page size/margins honored, footer + page numbers, dynamic data,
  table pagination basics, errors logged. ✔
- **Editing:** original intact (overlay), text/image/signature at correct coords, watermark on
  selected pages, delete/reorder/rotate export correctly. ✔
- **API:** bearer auth, invalid keys rejected, job status queryable, working download URL,
  standard error format. ✔
- **Dashboard:** create/use API key field, generate from template, upload+edit, download,
  view stats/logs. ✔
- **Self-host:** container starts, API local, generate+edit local, files saved local, env config. ✔

---

## 14. Phase-2 Extension Points (intentionally stubbed)

Async queue (BullMQ/Redis), Postgres + S3 drivers behind the store interface, custom font
embedding, visual template builder, annotation/redaction/compression, PHP/Python SDKs, CLI,
webhooks with signing. Each has a clear seam in the code and is **not** falsely advertised in
the UI.
