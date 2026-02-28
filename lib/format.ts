export function formatPrice(price: number | undefined): string {
  if (price == null) return "N/A";
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatDistance(miles: number | undefined): string {
  if (miles == null) return "";
  return `${miles.toFixed(1)} mi`;
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function formatBillingCode(result: { cpt?: string; hcpcs?: string; msDrg?: string }): string {
  if (result.cpt) return `CPT ${result.cpt}`;
  if (result.hcpcs) return `HCPCS ${result.hcpcs}`;
  if (result.msDrg) return `MS-DRG ${result.msDrg}`;
  return "";
}
