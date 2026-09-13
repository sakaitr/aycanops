/** Convert both legacy field-error objects and plain API errors to renderable text. */
export function errorText(error: unknown, fallback = "İşlem tamamlanamadı"): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const messages = Object.entries(error).flatMap(([field, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.filter((v): v is string => typeof v === "string").map(v => `${field}: ${v}`);
    });
    if (messages.length) return messages.join(" · ");
  }
  return fallback;
}
