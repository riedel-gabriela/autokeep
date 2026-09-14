import type { Vehicle } from "@autokeep/domain";

export interface Organization {
  organizationId: string;
  companyName: string;
  role: "ADMIN" | "DRIVER";
}

export interface Member {
  userId: string;
  email: string;
  role: "ADMIN" | "DRIVER";
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: () => string | undefined;

  constructor(baseUrl: string, token: () => string | undefined) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const accessToken = this.token();
    if (!accessToken) throw new Error("Sessão expirada");
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (!response.ok) throw new Error(response.status === 403 ? "Você não tem permissão para esta ação" : "Não foi possível concluir a operação");
    return response.json() as Promise<T>;
  }

  organizations() {
    return this.request<{ organizations: Organization[] }>("/api/me/organizations");
  }

  createOrganization(companyName: string) {
    return this.request<{ id: string; companyName: string; role: "ADMIN" }>("/api/organizations", {
      method: "POST", body: JSON.stringify({ companyName }),
    });
  }

  dashboard(organizationId: string) {
    return this.request<{ vehicles: Vehicle[] }>(`/api/organizations/${organizationId}/dashboard`);
  }

  members(organizationId: string) {
    return this.request<{ members: Member[] }>(`/api/organizations/${organizationId}/members`);
  }

  createVehicle(organizationId: string, input: Record<string, unknown>) {
    return this.request<Vehicle>(`/api/organizations/${organizationId}/vehicles`, {
      method: "POST", body: JSON.stringify(input),
    });
  }

  updateOdometer(organizationId: string, vehicleId: string, odometer: number, source: "MANUAL" | "OBD2") {
    return this.request<Vehicle>(`/api/organizations/${organizationId}/vehicles/${vehicleId}/odometer`, {
      method: "POST", body: JSON.stringify({ odometer, source, measuredAt: new Date().toISOString() }),
    });
  }

  registerOilChange(organizationId: string, vehicleId: string, odometer: number, oilType: Vehicle["oilType"]) {
    return this.request<Vehicle>(`/api/organizations/${organizationId}/vehicles/${vehicleId}/oil-changes`, {
      method: "POST", body: JSON.stringify({ odometer, oilType, changedAt: new Date().toISOString() }),
    });
  }

  assignDriver(organizationId: string, vehicleId: string, driverId: string | null) {
    return this.request<Vehicle>(`/api/organizations/${organizationId}/vehicles/${vehicleId}/driver`, {
      method: "PUT", body: JSON.stringify({ driverId }),
    });
  }

  archiveVehicle(organizationId: string, vehicleId: string) {
    return this.request<{ archived: boolean }>(`/api/organizations/${organizationId}/vehicles/${vehicleId}`, { method: "DELETE" });
  }

  removeMember(organizationId: string, memberId: string) {
    return this.request<{ removed: boolean }>(`/api/organizations/${organizationId}/members/${memberId}`, { method: "DELETE" });
  }

  inviteDriver(organizationId: string, email: string) {
    return this.request<{ accepted: boolean }>(`/api/organizations/${organizationId}/invitations`, {
      method: "POST", body: JSON.stringify({ email }),
    });
  }

  acceptInvitation(token: string) {
    return this.request<Organization>("/api/invitations/accept", {
      method: "POST", body: JSON.stringify({ token }),
    });
  }
}
