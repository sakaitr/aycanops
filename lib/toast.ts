export type ToastType = "success" | "error" | "info" | "warning";

export function toast(message: string, type: ToastType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("__toast__", { detail: { message, type } }));
}

toast.success = (message: string) => toast(message, "success");
toast.error = (message: string) => toast(message, "error");
toast.warning = (message: string) => toast(message, "warning");
toast.info = (message: string) => toast(message, "info");
