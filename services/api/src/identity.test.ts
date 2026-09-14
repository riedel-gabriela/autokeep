import { describe, expect, it } from "vitest";
import { identityFromEvent } from "./identity.js";

describe("identityFromEvent", () => {
  it("uses only validated JWT claims", () => {
    const event = {
      requestContext: { authorizer: { jwt: { claims: { sub: "user-123", email: "User@Example.com" }, scopes: [] } } },
    };
    expect(identityFromEvent(event as never)).toEqual({ sub: "user-123", email: "user@example.com" });
  });

  it("rejects a request without authorizer claims", () => {
    expect(() => identityFromEvent({ requestContext: {} } as never)).toThrow("UNAUTHORIZED");
  });
});
