import type { EventBridgeHandler } from "aws-lambda";
import { calculateMaintenanceStatus, calibrationMilestone, estimateOdometer } from "@autokeep/domain";
import { sendAlert } from "./notifications.js";
import { claimNotification, listAllVehicles, listNotificationRecipients, releaseNotification } from "./repository.js";

export const handler: EventBridgeHandler<"Scheduled Event", Record<string, never>, void> = async () => {
  const vehicles = await listAllVehicles();
  let sent = 0;

  for (const vehicle of vehicles) {
    const effectiveOdometer = vehicle.trackingMode === "MANUAL"
      ? estimateOdometer(vehicle.currentOdometer, vehicle.lastUpdateDate, vehicle.avgDailyKm)
      : vehicle.currentOdometer;
    const status = calculateMaintenanceStatus({ ...vehicle, currentOdometer: effectiveOdometer });
    const milestone = vehicle.trackingMode === "MANUAL"
      ? calibrationMilestone(vehicle.historicalEntries, vehicle.createdAt)
      : null;

    const notification = status.level !== "OK"
      ? {
          key: `MAINTENANCE_${status.level}_${vehicle.lastOilChangeDate.slice(0, 10)}_${vehicle.oilType}`,
          message: status.level === "DUE"
            ? `O veículo ${vehicle.name} atingiu o limite de troca de óleo. Registre a manutenção no AutoKeep.`
            : `O veículo ${vehicle.name} está próximo do limite de troca de óleo. Consulte o AutoKeep.`,
        }
      : milestone
        ? { key: `CALIBRATION_DAY_${milestone}`, message: `Informe o odômetro atual do veículo ${vehicle.name} para calibrar a previsão do AutoKeep.` }
        : null;

    if (!notification || !(await claimNotification(vehicle.organizationId, vehicle.id, notification.key))) continue;
    const recipients = await listNotificationRecipients(vehicle.organizationId, vehicle.assignedDriverId);
    if (recipients.length > 0) {
      try {
        await sendAlert(recipients, notification.message);
        sent += 1;
      } catch {
        await releaseNotification(vehicle.organizationId, vehicle.id, notification.key);
        throw new Error("Notification delivery failed");
      }
    }
  }

  console.info(JSON.stringify({ event: "daily_monitor_completed", vehiclesProcessed: vehicles.length, notificationsSent: sent }));
};
