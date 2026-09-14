export interface ObdReading {
  distanceSinceCodesClearedKm: number;
  warning: string;
}

interface BluetoothNavigator extends Navigator {
  bluetooth?: {
    requestDevice(options: unknown): Promise<{
      gatt?: { connect(): Promise<{ getPrimaryService(service: string): Promise<{ getCharacteristic(characteristic: string): Promise<{
        startNotifications(): Promise<void>;
        writeValue(value: BufferSource): Promise<void>;
        addEventListener(type: string, listener: EventListener): void;
      }> }> }> };
    }>;
  };
}

const ELM_SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
const ELM_CHARACTERISTIC = "0000fff1-0000-1000-8000-00805f9b34fb";

export async function readObdDistance(): Promise<ObdReading> {
  const bluetooth = (navigator as BluetoothNavigator).bluetooth;
  if (!bluetooth) throw new Error("Web Bluetooth não está disponível neste navegador");
  const device = await bluetooth.requestDevice({
    filters: [{ namePrefix: "OBD" }, { namePrefix: "ELM" }],
    optionalServices: [ELM_SERVICE],
  });
  const server = await device.gatt?.connect();
  if (!server) throw new Error("Não foi possível conectar ao adaptador");
  const service = await server.getPrimaryService(ELM_SERVICE);
  const characteristic = await service.getCharacteristic(ELM_CHARACTERISTIC);
  await characteristic.startNotifications();

  const response = await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("O adaptador não respondeu")), 8_000);
    const chunks: string[] = [];
    characteristic.addEventListener("characteristicvaluechanged", ((event: Event) => {
      const value = (event.target as unknown as { value?: DataView }).value;
      if (!value) return;
      chunks.push(new TextDecoder().decode(value));
      const combined = chunks.join("");
      if (combined.includes(">")) {
        window.clearTimeout(timeout);
        resolve(combined);
      }
    }) as EventListener);
    void characteristic.writeValue(new TextEncoder().encode("0131\r"));
  });

  const match = response.replace(/\s/g, "").match(/4131([0-9A-Fa-f]{4})/);
  if (!match?.[1]) throw new Error("O veículo não oferece o PID 01 31");
  return {
    distanceSinceCodesClearedKm: Number.parseInt(match[1], 16),
    warning: "Esse PID mede a distância desde a limpeza de falhas, não o odômetro total. Confirme a leitura no painel.",
  };
}
