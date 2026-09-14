import { randomUUID } from "node:crypto";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { ZodError, type ZodType } from "zod";
import { badRequest, HttpError } from "./errors.js";

export function json(statusCode: number, body?: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: body === undefined ? "" : JSON.stringify(body),
  };
}

export function parseBody<T>(rawBody: string | undefined, schema: ZodType<T>): T {
  if (!rawBody || rawBody.length > 32_768) throw badRequest();
  try {
    return schema.parse(JSON.parse(rawBody));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) throw badRequest();
    throw error;
  }
}

export function safeFailure(error: unknown, routeKey: string): APIGatewayProxyStructuredResultV2 {
  const errorId = randomUUID();
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const code = error instanceof HttpError ? error.code : "INTERNAL_ERROR";
  console.error(JSON.stringify({ event: "request_failed", errorId, routeKey, statusCode, code }));
  return json(statusCode, { code, errorId });
}
