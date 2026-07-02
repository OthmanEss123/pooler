export function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(value) || 0;
}

export function formatCurrency(
  value: string | number | null | undefined,
  currency = "USD",
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

export function formatCompact(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

export function formatNumber(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(toNumber(value));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
