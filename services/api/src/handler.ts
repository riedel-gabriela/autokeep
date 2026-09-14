import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import {
  acceptInvitationSchema, assignDriverSchema, createOrganizationSchema, createVehicleSchema,
  idSchema, invitationSchema, odometerUpdateSchema, oilChangeSchema,
} from "@autokeep/domain";
import { identityFromEvent } from "./identity.js";
import { badRequest } from "./errors.js";
import { json, parseBody, safeFailure } from "./http.js";
import { sendInvitation } from "./notifications.js";
import {
  acceptInvitation, archiveVehicle, assignDriver, createInvitation, createOrganization, createVehicle,
  getApplicationUrl, listMembers, listMembershipsForUser, listVehicles, registerOilChange, removeMember, updateOdometer,
} from "./repository.js";

function pathIds(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const params = event.pathParameters ?? {};
  const organizationId = params.organizationId ? idSchema.parse(params.organizationId) : undefined;
  const vehicleId = params.vehicleId ? idSchema.parse(params.vehicleId) : undefined;
  const memberId = params.memberId ? idSchema.parse(params.memberId) : undefined;
  return { organizationId, vehicleId, memberId };
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const routeKey = event.routeKey;
  try {
    if (routeKey === "GET /api/health") return json(200, { status: "ok" });
    const identity = identityFromEvent(event);

    if (routeKey === "GET /api/me/organizations") {
      return json(200, { organizations: await listMembershipsForUser(identity.sub) });
    }
    if (routeKey === "POST /api/organizations") {
      const input = parseBody(event.body, createOrganizationSchema);
      return json(201, await createOrganization(input.companyName, identity.sub, identity.email));
    }
    if (routeKey === "POST /api/invitations/accept") {
      const input = parseBody(event.body, acceptInvitationSchema);
      return json(200, await acceptInvitation(input.token, identity.sub, identity.email));
    }

    const { organizationId, vehicleId, memberId } = pathIds(event);
    if (!organizationId) throw badRequest();

    if (routeKey === "GET /api/organizations/{organizationId}/dashboard") {
      return json(200, { vehicles: await listVehicles(organizationId, identity.sub) });
    }
    if (routeKey === "GET /api/organizations/{organizationId}/members") {
      return json(200, { members: await listMembers(organizationId, identity.sub) });
    }
    if (routeKey === "POST /api/organizations/{organizationId}/vehicles") {
      const input = parseBody(event.body, createVehicleSchema);
      return json(201, await createVehicle(organizationId, identity.sub, input));
    }
    if (routeKey === "POST /api/organizations/{organizationId}/invitations") {
      const input = parseBody(event.body, invitationSchema);
      const invitation = await createInvitation(organizationId, identity.sub, input.email.toLowerCase());
      await sendInvitation(input.email, invitation.companyName, invitation.token, await getApplicationUrl());
      return json(202, { accepted: true });
    }
    if (routeKey === "DELETE /api/organizations/{organizationId}/members/{memberId}") {
      if (!memberId) throw badRequest();
      await removeMember(organizationId, memberId, identity.sub);
      return json(200, { removed: true });
    }

    if (!vehicleId) throw badRequest();
    if (routeKey === "POST /api/organizations/{organizationId}/vehicles/{vehicleId}/odometer") {
      const input = parseBody(event.body, odometerUpdateSchema);
      return json(200, await updateOdometer(organizationId, vehicleId, identity.sub, input));
    }
    if (routeKey === "POST /api/organizations/{organizationId}/vehicles/{vehicleId}/oil-changes") {
      const input = parseBody(event.body, oilChangeSchema);
      return json(200, await registerOilChange(organizationId, vehicleId, identity.sub, input));
    }
    if (routeKey === "PUT /api/organizations/{organizationId}/vehicles/{vehicleId}/driver") {
      const input = parseBody(event.body, assignDriverSchema);
      return json(200, await assignDriver(organizationId, vehicleId, identity.sub, input.driverId));
    }
    if (routeKey === "DELETE /api/organizations/{organizationId}/vehicles/{vehicleId}") {
      await archiveVehicle(organizationId, vehicleId, identity.sub);
      return json(200, { archived: true });
    }
    return json(404, { code: "NOT_FOUND" });
  } catch (error) {
    return safeFailure(error, routeKey);
  }
};
