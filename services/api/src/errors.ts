export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = () => new HttpError(400, "BAD_REQUEST");
export const unauthorized = () => new HttpError(401, "UNAUTHORIZED");
export const forbidden = () => new HttpError(403, "FORBIDDEN");
export const notFound = () => new HttpError(404, "NOT_FOUND");
export const conflict = () => new HttpError(409, "CONFLICT");
