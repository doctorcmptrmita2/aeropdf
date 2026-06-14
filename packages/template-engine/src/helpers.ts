import Handlebars from "handlebars";

/**
 * Handlebars passes its `options` object as the LAST argument to every helper. So an optional
 * trailing param (e.g. `currency`, `locale`, `digits`) receives that object when the template
 * omits it — `{{formatDate date}}` calls our helper as `(date, options)`. Guard against it.
 */
function isOptions(x: unknown): boolean {
  return typeof x === "object" && x !== null && ("hash" in x || "fn" in x || "data" in x);
}
function strOr(x: unknown, fallback: string): string {
  return isOptions(x) || typeof x !== "string" || x.length === 0 ? fallback : x;
}
function numOr(x: unknown, fallback: number): number {
  if (isOptions(x) || x == null) return fallback;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/** Register formatting + logic helpers used by templates (PRD §8.2). */
export function registerHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper("formatCurrency", (value: unknown, currency?: unknown) => {
    const n = Number(value) || 0;
    const cur = strOr(currency, "USD");
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
    } catch {
      return n.toFixed(2);
    }
  });

  hbs.registerHelper("formatNumber", (value: unknown, digits?: unknown) => {
    const n = Number(value) || 0;
    return n.toFixed(numOr(digits, 2));
  });

  hbs.registerHelper("formatDate", (value: unknown, locale?: unknown) => {
    if (!value) return "";
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat(strOr(locale, "en-US"), { year: "numeric", month: "short", day: "2-digit" }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  });

  hbs.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  hbs.registerHelper("gt", (a: unknown, b: unknown) => Number(a) > Number(b));
  hbs.registerHelper("multiply", (a: unknown, b: unknown) => (Number(a) || 0) * (numOr(b, 0)));
  hbs.registerHelper("sum", (...args: unknown[]) => {
    const nums = args.slice(0, -1).map((x) => Number(x) || 0);
    return nums.reduce((acc, n) => acc + n, 0);
  });
}
