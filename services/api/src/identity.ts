import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { unauthorized } from "./errors.js";

export interface Identity {
  sub: string;
  email: string;
}

export function identityFromEvent(event: APIGatewayProxyEventV2WithJWTAuthorizer): Identity {
  const claims = event.requestContext.authorizer?.jwt.claims;
  const sub = typeof claims?.sub === "string" ? claims.sub : "";
  const email = typeof claims?.email === "string" ? claims.email : "";
  if (!sub || !email) throw unauthorized();
  return { sub, email: email.trim().toLowerCase() };
}
