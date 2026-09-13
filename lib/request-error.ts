/** Expected input/conflict failures whose message is safe to show to users. */
export class RequestError extends Error {
  constructor(message: string, public readonly status = 400, public readonly details?: unknown) {
    super(message);
    this.name = "RequestError";
  }
}
