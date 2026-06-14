# AeroPDF.dev

> Developer-first PDF engine — generate, edit, sign, merge and automate PDFs through API, SDK,
> dashboard and a self-hosted Docker runtime.

This is the MVP monorepo. See [proje.md](../proje.md) (product, TR) and [Specs.md](../Specs.md)
(technical) for the full design.

## Quick start

```bash
npm install
npm run dev        # API + dashboard on http://localhost:8080
```

- Landing:   <http://localhost:8080/>
- Dashboard: <http://localhost:8080/dashboard>  (API key field defaults to `local-dev-key`)
- Health:    <http://localhost:8080/health>

> HTML→PDF uses a headless browser when Puppeteer + Chromium are present; otherwise the engine
> falls back to a pure-JS structured renderer, so generation always works.

## Layout

```
apps/api                  Fastify REST API + static hosting
apps/dashboard            Landing + dashboard (static)
packages/shared           Types + error system
packages/pdf-engine       pdf-lib operations (overlay, merge, split, pages, forms)
packages/template-engine  Handlebars render + built-in templates + structured renderer
packages/sdk-node         Node.js SDK
docker                    Dockerfile + docker-compose
```

## API cheatsheet

All `/v1/*` calls need `Authorization: Bearer <AEROPDF_API_KEY>`.

```bash
# Generate from a template
curl -s -X POST http://localhost:8080/v1/pdf/generate \
  -H "Authorization: Bearer local-dev-key" -H "Content-Type: application/json" \
  -d '{"source":"template","templateId":"invoice-basic","data":{"customer":{"name":"Acme"}}}'

# Upload, then watermark
curl -s -X POST http://localhost:8080/v1/pdf/upload \
  -H "Authorization: Bearer local-dev-key" -F file=@document.pdf

curl -s -X POST http://localhost:8080/v1/pdf/watermark \
  -H "Authorization: Bearer local-dev-key" -H "Content-Type: application/json" \
  -d '{"file_id":"file_xxx","text":"CONFIDENTIAL"}'
```

Endpoints: `generate · upload · edit · merge · split · watermark · fill-form · jobs/:id ·
files · files/:id/download`. Full request/response shapes in [Specs.md](../Specs.md) §6.3.

## SDK

```ts
import { AeroPDF } from "@aeropdf/sdk";
const client = new AeroPDF({ apiKey: "local-dev-key", baseUrl: "http://localhost:8080" });
const r = await client.pdf.generate({ source: "template", templateId: "invoice-basic", data: {} });
console.log(r.download_url);
```

## Self-host (Docker)

```bash
docker compose -f docker/docker-compose.yml up --build
# → http://localhost:8080
```

## Product rule

External PDFs are edited via **overlay operations** + **page operations** only.
AeroPDF-native documents are edited via **template + data regeneration**.
The MVP does **not** promise Word-like reflow editing of arbitrary PDFs.
