/** Built-in document templates (PRD §5.3). Each ships HTML + sample data. */

export interface BuiltinTemplate {
  id: string;
  name: string;
  html: string;
  sampleData: Record<string, unknown>;
}

const BRAND_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #0E1B3D; margin: 0; padding: 48px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { color: #2563EB; font-weight: 800; font-size: 26px; }
  .brand b { color: #F4534D; }
  h1 { font-size: 30px; margin: 0 0 4px; }
  .muted { color: #64748B; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  th { text-align: left; background: #0E1B3D; color: #fff; padding: 10px 12px; font-size: 12px; }
  td { padding: 10px 12px; border-bottom: 1px solid #E2E8F0; font-size: 13px; }
  .right { text-align: right; }
  .totals { margin-left: auto; width: 280px; }
  .totals .grand { font-size: 18px; font-weight: 800; color: #2563EB; }
`;

const invoice: BuiltinTemplate = {
  id: "invoice-basic",
  name: "Invoice (Basic)",
  html: `<!doctype html><html><head><meta charset="utf-8"><style>${BRAND_CSS}</style></head><body>
  <div class="row">
    <div><div class="brand">Aero<b>PDF</b></div><div class="muted">{{seller.name}}</div></div>
    <div class="right"><h1>INVOICE</h1><div class="muted">#{{invoice_no}}</div>
      <div class="muted">{{formatDate invoice_date}}</div></div>
  </div>
  <p><strong>Bill to:</strong> {{customer.name}}<br><span class="muted">{{customer.email}}</span></p>
  <table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
  <tbody>{{#each items}}<tr><td>{{name}}</td><td class="right">{{quantity}}</td>
    <td class="right">{{formatCurrency price}}</td><td class="right">{{formatCurrency (multiply quantity price)}}</td></tr>{{/each}}</tbody></table>
  <div class="totals"><div class="row"><span>Subtotal</span><span>{{formatCurrency subtotal}}</span></div>
    <div class="row"><span>Tax</span><span>{{formatCurrency tax}}</span></div>
    <div class="row grand"><span>Total</span><span>{{formatCurrency grand_total}}</span></div></div>
  </body></html>`,
  sampleData: {
    invoice_no: "INV-001",
    invoice_date: "2026-06-14",
    seller: { name: "AeroPDF Ltd." },
    customer: { name: "Acme Ltd.", email: "billing@acme.com" },
    items: [
      { name: "PDF API — Pro plan", quantity: 1, price: 49 },
      { name: "Extra render credits", quantity: 2, price: 19 },
    ],
    subtotal: 87,
    tax: 7.83,
    grand_total: 94.83,
  },
};

const report: BuiltinTemplate = {
  id: "report-basic",
  name: "Report (Basic)",
  html: `<!doctype html><html><head><meta charset="utf-8"><style>${BRAND_CSS}</style></head><body>
  <div class="brand">Aero<b>PDF</b></div>
  <h1>{{title}}</h1><div class="muted">{{formatDate date}} · {{author}}</div>
  <p>{{summary}}</p>
  <table><thead><tr><th>Metric</th><th class="right">Value</th></tr></thead>
  <tbody>{{#each metrics}}<tr><td>{{label}}</td><td class="right">{{value}}</td></tr>{{/each}}</tbody></table>
  </body></html>`,
  sampleData: {
    title: "Monthly Usage Report",
    date: "2026-06-01",
    author: "AeroPDF",
    summary: "Overview of PDF generation activity for the period.",
    metrics: [
      { label: "PDFs generated", value: "124,540" },
      { label: "Success rate", value: "99.6%" },
      { label: "Avg generation time", value: "1.42s" },
    ],
  },
};

const certificate: BuiltinTemplate = {
  id: "certificate-basic",
  name: "Certificate (Basic)",
  html: `<!doctype html><html><head><meta charset="utf-8"><style>${BRAND_CSS}
  body{text-align:center;padding:96px} h1{font-size:44px;color:#2563EB} .name{font-size:34px;margin:24px 0}
  </style></head><body>
  <div class="brand">Aero<b>PDF</b></div>
  <h1>Certificate of {{kind}}</h1>
  <p class="muted">This certifies that</p>
  <div class="name">{{recipient}}</div>
  <p>{{description}}</p>
  <p class="muted">{{formatDate date}} · {{issuer}}</p>
  </body></html>`,
  sampleData: {
    kind: "Completion",
    recipient: "Ahmet Aslan",
    description: "has successfully completed the AeroPDF Developer Course.",
    date: "2026-06-14",
    issuer: "AeroPDF Academy",
  },
};

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [invoice, report, certificate];

export function getBuiltinTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
