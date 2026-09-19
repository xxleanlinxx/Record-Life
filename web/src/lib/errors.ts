export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "request_failed",
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}
