import Handlebars from "handlebars";

/** Register formatting + logic helpers used by templates (PRD §8.2). */
export function registerHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper("formatCurrency", (value: unknown, currency = "USD") => {
    const n = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency) }).format(n);
    } catch {
      return n.toFixed(2);
    }
  });

  hbs.registerHelper("formatNumber", (value: unknown, digits = 2) => {
    const n = Number(value) || 0;
    return n.toFixed(Number(digits));
  });

  hbs.registerHelper("formatDate", (value: unknown, locale = "en-US") => {
    if (!value) return "";
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat(String(locale), { year: "numeric", month: "short", day: "2-digit" }).format(d);
  });

  hbs.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  hbs.registerHelper("gt", (a: unknown, b: unknown) => Number(a) > Number(b));
  hbs.registerHelper("multiply", (a: unknown, b: unknown) => (Number(a) || 0) * (Number(b) || 0));
  hbs.registerHelper("sum", (...args: unknown[]) => {
    const nums = args.slice(0, -1).map((x) => Number(x) || 0);
    return nums.reduce((acc, n) => acc + n, 0);
  });
}
