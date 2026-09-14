export type OilType = "MINERAL" | "SEMI_SYNTHETIC" | "FULL_SYNTHETIC";
export type TrackingMode = "MANUAL" | "OBD2";
export type OrganizationRole = "ADMIN" | "DRIVER";
export type OdometerSource = "MANUAL" | "OBD2" | "PREDICTED";

export interface OdometerEntry {
  date: string;
  odometer: number;
  source: OdometerSource;
}

export interface VehicleMaintenanceInput {
  currentOdometer: number;
  lastOilChangeKm: number;
  lastOilChangeDate: string;
  oilType: OilType;
  avgDailyKm: number;
}

export type MaintenanceLevel = "OK" | "WARNING" | "DUE";

export interface MaintenanceStatus {
  level: MaintenanceLevel;
  trigger: "DISTANCE" | "TIME" | null;
  distanceRemainingKm: number;
  daysRemaining: number;
  projectedDueDate: string | null;
}

export interface Vehicle extends VehicleMaintenanceInput {
  id: string;
  organizationId: string;
  name: string;
  trackingMode: TrackingMode;
  assignedDriverId?: string;
  historicalEntries: OdometerEntry[];
  lastUpdateDate: string;
  createdAt: string;
  status?: MaintenanceStatus;
}
