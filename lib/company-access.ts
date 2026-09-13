import { RequestError } from "./request-error";

export function assertCompanyAccess(user: { allowed_companies: string | null }, companyId: string | null) {
  if (user.allowed_companies !== null) {
    let allowed: unknown;
    try { allowed = JSON.parse(user.allowed_companies); } catch { allowed = []; }
    if (!Array.isArray(allowed) || !companyId || !allowed.includes(companyId))
      throw new RequestError("Bu firmaya erişim yetkiniz yok", 403);
  }
}
