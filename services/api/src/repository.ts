import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  calculateAverageDailyKm,
  calculateMaintenanceStatus,
  type OdometerEntry,
  type OrganizationRole,
  type Vehicle,
} from "@autokeep/domain";
import { config } from "./config.js";
import { conflict, forbidden, notFound } from "./errors.js";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

type Item = Record<string, unknown> & { PK: string; SK: string; entityType: string };
export interface Membership { organizationId: string; companyName: string; userId: string; email: string; role: OrganizationRole }

const orgPk = (organizationId: string) => `ORG#${organizationId}`;
const vehicleSk = (vehicleId: string) => `VEHICLE#${vehicleId}`;
const nowIso = () => new Date().toISOString();
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

function auditItem(organizationId: string, actorId: string, action: string, resourceId: string, at = nowIso()): Item {
  return {
    PK: orgPk(organizationId),
    SK: `AUDIT#${at}#${randomUUID()}`,
    entityType: "AUDIT",
    actorId,
    action,
    resourceId,
    createdAt: at,
  };
}

function toVehicle(item: Item): Vehicle {
  const vehicle = item as Item & Omit<Vehicle, "status">;
  return {
    id: vehicle.id,
    organizationId: vehicle.organizationId,
    name: vehicle.name,
    trackingMode: vehicle.trackingMode,
    ...(vehicle.assignedDriverId ? { assignedDriverId: vehicle.assignedDriverId } : {}),
    currentOdometer: vehicle.currentOdometer,
    avgDailyKm: vehicle.avgDailyKm,
    oilType: vehicle.oilType,
    lastOilChangeKm: vehicle.lastOilChangeKm,
    lastOilChangeDate: vehicle.lastOilChangeDate,
    historicalEntries: vehicle.historicalEntries,
    lastUpdateDate: vehicle.lastUpdateDate,
    createdAt: vehicle.createdAt,
    status: calculateMaintenanceStatus(vehicle),
  };
}

async function queryAll(input: QueryCommandInput): Promise<Item[]> {
  const items: Item[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({ ...input, ExclusiveStartKey: exclusiveStartKey }));
    items.push(...((result.Items ?? []) as Item[]));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

export async function createOrganization(companyName: string, userId: string, email: string) {
  const organizationId = randomUUID();
  const createdAt = nowIso();
  const organization: Item = {
    PK: orgPk(organizationId), SK: "META", entityType: "ORGANIZATION",
    organizationId, companyName, ownerId: userId, createdAt,
  };
  const membership: Item = {
    PK: orgPk(organizationId), SK: `MEMBER#${userId}`, entityType: "MEMBERSHIP",
    GSI1PK: `USER#${userId}`, GSI1SK: `ORG#${organizationId}`,
    organizationId, companyName, userId, email, role: "ADMIN", createdAt,
  };
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Put: { TableName: config.tableName, Item: organization, ConditionExpression: "attribute_not_exists(PK)" } },
    { Put: { TableName: config.tableName, Item: membership, ConditionExpression: "attribute_not_exists(PK)" } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "ORGANIZATION_CREATED", organizationId, createdAt) } },
  ] }));
  return { id: organizationId, companyName, role: "ADMIN" as const };
}

export async function listMembershipsForUser(userId: string): Promise<Array<Pick<Membership, "organizationId" | "companyName" | "role">>> {
  const items = await queryAll({
    TableName: config.tableName,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `USER#${userId}` },
  });
  return items.map((item) => ({
    organizationId: String(item.organizationId), companyName: String(item.companyName),
    role: item.role as OrganizationRole,
  }));
}

export async function getApplicationUrl(): Promise<string> {
  const result = await client.send(new GetCommand({
    TableName: config.tableName,
    Key: { PK: "SYSTEM#CONFIG", SK: "WEB" },
    ConsistentRead: true,
  }));
  if (!result.Item?.applicationUrl) throw new Error("Application URL is not configured");
  return String(result.Item.applicationUrl);
}

export async function requireMembership(organizationId: string, userId: string): Promise<Membership> {
  const result = await client.send(new GetCommand({
    TableName: config.tableName,
    Key: { PK: orgPk(organizationId), SK: `MEMBER#${userId}` },
    ConsistentRead: true,
  }));
  if (!result.Item) throw forbidden();
  const item = result.Item as Item;
  return {
    organizationId, companyName: String(item.companyName), userId,
    email: String(item.email), role: item.role as OrganizationRole,
  };
}

export async function requireAdmin(organizationId: string, userId: string): Promise<Membership> {
  const membership = await requireMembership(organizationId, userId);
  if (membership.role !== "ADMIN") throw forbidden();
  return membership;
}

export async function listMembers(organizationId: string, userId: string): Promise<Array<Pick<Membership, "userId" | "email" | "role">>> {
  await requireAdmin(organizationId, userId);
  const items = await queryAll({
    TableName: config.tableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": orgPk(organizationId), ":prefix": "MEMBER#" },
  });
  return items.map((item) => ({ userId: String(item.userId), email: String(item.email), role: item.role as OrganizationRole }));
}

export async function createVehicle(organizationId: string, userId: string, input: {
  name: string; trackingMode: "MANUAL" | "OBD2"; oilType: "MINERAL" | "SEMI_SYNTHETIC" | "FULL_SYNTHETIC";
  currentOdometer: number; lastOilChangeKm: number; lastOilChangeDate: string;
}): Promise<Vehicle> {
  await requireAdmin(organizationId, userId);
  const id = randomUUID();
  const createdAt = nowIso();
  const firstEntry: OdometerEntry = { date: createdAt, odometer: input.currentOdometer, source: "MANUAL" };
  const item: Item = {
    PK: orgPk(organizationId), SK: vehicleSk(id), entityType: "VEHICLE",
    GSI2PK: "VEHICLES", GSI2SK: `ORG#${organizationId}#VEHICLE#${id}`,
    id, organizationId, ...input, avgDailyKm: 0, historicalEntries: [firstEntry],
    lastUpdateDate: createdAt, createdAt,
  };
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Put: { TableName: config.tableName, Item: item, ConditionExpression: "attribute_not_exists(PK)" } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "VEHICLE_CREATED", id, createdAt) } },
  ] }));
  return toVehicle(item);
}

export async function getVehicle(organizationId: string, vehicleId: string): Promise<Vehicle> {
  const result = await client.send(new GetCommand({
    TableName: config.tableName,
    Key: { PK: orgPk(organizationId), SK: vehicleSk(vehicleId) },
    ConsistentRead: true,
  }));
  if (!result.Item || result.Item.entityType !== "VEHICLE") throw notFound();
  return toVehicle(result.Item as Item);
}

export async function listVehicles(organizationId: string, userId: string): Promise<Vehicle[]> {
  const membership = await requireMembership(organizationId, userId);
  const items = await queryAll({
    TableName: config.tableName, IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :prefix)",
    ExpressionAttributeValues: { ":pk": "VEHICLES", ":prefix": `ORG#${organizationId}#` },
  });
  return items.map(toVehicle).filter((vehicle) => membership.role === "ADMIN" || vehicle.assignedDriverId === userId);
}

export async function updateOdometer(organizationId: string, vehicleId: string, userId: string, input: {
  odometer: number; source: "MANUAL" | "OBD2"; measuredAt: string;
}): Promise<Vehicle> {
  const membership = await requireMembership(organizationId, userId);
  const vehicle = await getVehicle(organizationId, vehicleId);
  if (membership.role !== "ADMIN" && vehicle.assignedDriverId !== userId) throw forbidden();
  if (
    input.odometer < vehicle.currentOdometer ||
    new Date(input.measuredAt) < new Date(vehicle.lastUpdateDate) ||
    new Date(input.measuredAt) > new Date(Date.now() + 300_000)
  ) throw conflict();

  const history = [...vehicle.historicalEntries, { date: input.measuredAt, odometer: input.odometer, source: input.source } as OdometerEntry]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-3);
  const avgDailyKm = calculateAverageDailyKm(history);
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Update: {
      TableName: config.tableName, Key: { PK: orgPk(organizationId), SK: vehicleSk(vehicleId) },
      UpdateExpression: "SET currentOdometer = :odometer, lastUpdateDate = :measuredAt, historicalEntries = :history, avgDailyKm = :average",
      ConditionExpression: "currentOdometer <= :odometer",
      ExpressionAttributeValues: { ":odometer": input.odometer, ":measuredAt": input.measuredAt, ":history": history, ":average": avgDailyKm },
    } },
    { Put: { TableName: config.tableName, Item: {
      PK: orgPk(organizationId), SK: `ODOMETER#${vehicleId}#${input.measuredAt}#${randomUUID()}`,
      entityType: "ODOMETER_ENTRY", vehicleId, registeredBy: userId, ...input,
    } } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "ODOMETER_UPDATED", vehicleId) } },
  ] }));
  return getVehicle(organizationId, vehicleId);
}

export async function registerOilChange(organizationId: string, vehicleId: string, userId: string, input: {
  odometer: number; changedAt: string; oilType: "MINERAL" | "SEMI_SYNTHETIC" | "FULL_SYNTHETIC";
}): Promise<Vehicle> {
  await requireAdmin(organizationId, userId);
  const vehicle = await getVehicle(organizationId, vehicleId);
  if (
    input.odometer < vehicle.currentOdometer ||
    new Date(input.changedAt) < new Date(vehicle.lastOilChangeDate) ||
    new Date(input.changedAt) > new Date(Date.now() + 300_000)
  ) throw conflict();
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Update: {
      TableName: config.tableName, Key: { PK: orgPk(organizationId), SK: vehicleSk(vehicleId) },
      UpdateExpression: "SET currentOdometer = :odometer, lastOilChangeKm = :odometer, lastOilChangeDate = :changedAt, oilType = :oilType, lastUpdateDate = :changedAt",
      ConditionExpression: "currentOdometer <= :odometer",
      ExpressionAttributeValues: { ":odometer": input.odometer, ":changedAt": input.changedAt, ":oilType": input.oilType },
    } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "OIL_CHANGE_REGISTERED", vehicleId) } },
  ] }));
  return getVehicle(organizationId, vehicleId);
}

export async function createInvitation(organizationId: string, userId: string, email: string) {
  const membership = await requireAdmin(organizationId, userId);
  const token = randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Put: { TableName: config.tableName, Item: {
      PK: `INVITE#${tokenHash(token)}`, SK: "META", entityType: "INVITATION",
      organizationId, companyName: membership.companyName, email, role: "DRIVER",
      expiresAt: Math.floor(Date.now() / 1000) + 7 * 86_400, createdAt,
    }, ConditionExpression: "attribute_not_exists(PK)" } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "DRIVER_INVITED", organizationId, createdAt) } },
  ] }));
  return { token, companyName: membership.companyName };
}

export async function acceptInvitation(token: string, userId: string, email: string) {
  const key = { PK: `INVITE#${tokenHash(token)}`, SK: "META" };
  const result = await client.send(new GetCommand({ TableName: config.tableName, Key: key, ConsistentRead: true }));
  if (!result.Item) throw notFound();
  const invitation = result.Item as Item;
  if (Number(invitation.expiresAt) < Math.floor(Date.now() / 1000) || String(invitation.email).toLowerCase() !== email) throw forbidden();
  const organizationId = String(invitation.organizationId);
  const createdAt = nowIso();
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Put: { TableName: config.tableName, Item: {
      PK: orgPk(organizationId), SK: `MEMBER#${userId}`, entityType: "MEMBERSHIP",
      GSI1PK: `USER#${userId}`, GSI1SK: `ORG#${organizationId}`,
      organizationId, companyName: invitation.companyName, userId, email, role: "DRIVER", createdAt,
    }, ConditionExpression: "attribute_not_exists(PK)" } },
    { Delete: { TableName: config.tableName, Key: key, ConditionExpression: "attribute_exists(PK)" } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "INVITATION_ACCEPTED", organizationId, createdAt) } },
  ] }));
  return { organizationId, companyName: String(invitation.companyName), role: "DRIVER" as const };
}

export async function assignDriver(organizationId: string, vehicleId: string, userId: string, driverId: string | null): Promise<Vehicle> {
  await requireAdmin(organizationId, userId);
  await getVehicle(organizationId, vehicleId);
  if (driverId) {
    const target = await requireMembership(organizationId, driverId);
    if (target.role !== "DRIVER") throw conflict();
  }
  const expression = driverId ? "SET assignedDriverId = :driverId" : "REMOVE assignedDriverId";
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Update: {
      TableName: config.tableName, Key: { PK: orgPk(organizationId), SK: vehicleSk(vehicleId) },
      UpdateExpression: expression,
      ...(driverId ? { ExpressionAttributeValues: { ":driverId": driverId } } : {}),
    } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "DRIVER_ASSIGNMENT_CHANGED", vehicleId) } },
  ] }));
  return getVehicle(organizationId, vehicleId);
}

export async function archiveVehicle(organizationId: string, vehicleId: string, userId: string): Promise<void> {
  await requireAdmin(organizationId, userId);
  await getVehicle(organizationId, vehicleId);
  const archivedAt = nowIso();
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Update: {
      TableName: config.tableName, Key: { PK: orgPk(organizationId), SK: vehicleSk(vehicleId) },
      UpdateExpression: "SET entityType = :archived, archivedAt = :at REMOVE GSI2PK, GSI2SK, assignedDriverId",
      ConditionExpression: "entityType = :vehicle",
      ExpressionAttributeValues: { ":archived": "VEHICLE_ARCHIVED", ":vehicle": "VEHICLE", ":at": archivedAt },
    } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "VEHICLE_ARCHIVED", vehicleId, archivedAt) } },
  ] }));
}

export async function removeMember(organizationId: string, memberId: string, userId: string): Promise<void> {
  await requireAdmin(organizationId, userId);
  if (memberId === userId) throw conflict();
  const target = await requireMembership(organizationId, memberId);
  if (target.role !== "DRIVER") throw forbidden();
  const vehicles = await listVehicles(organizationId, userId);
  if (vehicles.some((vehicle) => vehicle.assignedDriverId === memberId)) throw conflict();
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Delete: {
      TableName: config.tableName,
      Key: { PK: orgPk(organizationId), SK: `MEMBER#${memberId}` },
      ConditionExpression: "attribute_exists(PK)",
    } },
    { Put: { TableName: config.tableName, Item: auditItem(organizationId, userId, "DRIVER_REMOVED", memberId) } },
  ] }));
}

export async function listAllVehicles(): Promise<Vehicle[]> {
  return (await queryAll({
    TableName: config.tableName, IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :pk",
    ExpressionAttributeValues: { ":pk": "VEHICLES" },
  })).map(toVehicle);
}

export async function listNotificationRecipients(organizationId: string, assignedDriverId?: string): Promise<string[]> {
  const items = await queryAll({
    TableName: config.tableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": orgPk(organizationId), ":prefix": "MEMBER#" },
  });
  const emails = items
    .filter((item) => item.role === "ADMIN" || (assignedDriverId && item.userId === assignedDriverId))
    .map((item) => String(item.email));
  return [...new Set(emails)];
}

export async function claimNotification(organizationId: string, vehicleId: string, key: string): Promise<boolean> {
  try {
    await client.send(new PutCommand({
      TableName: config.tableName,
      Item: { PK: orgPk(organizationId), SK: `NOTIFICATION#${vehicleId}#${key}`, entityType: "NOTIFICATION", vehicleId, createdAt: nowIso() },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

export async function releaseNotification(organizationId: string, vehicleId: string, key: string): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: config.tableName,
    Key: { PK: orgPk(organizationId), SK: `NOTIFICATION#${vehicleId}#${key}` },
  }));
}
