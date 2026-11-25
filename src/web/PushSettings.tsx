import { useEffect, useState } from 'react';
import { api, write } from './api.js';

const supported =
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function currentPushSubscription() {
  if (!supported) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export function PushSettings() {
  const [config, setConfig] = useState<{
    registration: ServiceWorkerRegistration;
    publicKey: string;
  }>();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supported) return;
    const controller = new AbortController();
    async function prepare() {
      const { publicKey } = await api<{ publicKey: string | null }>('/push/config', {
        signal: controller.signal,
      });
      if (!publicKey || controller.signal.aborted) return;
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (controller.signal.aborted) return;
      setActive(Boolean(subscription) && Notification.permission === 'granted');
      setConfig({ registration, publicKey });
    }
    void prepare().catch(() => {
      if (!controller.signal.aborted) setMessage('Não foi possível preparar as notificações push.');
    });
    return () => controller.abort();
  }, []);

  async function toggle() {
    if (!config) return;
    setBusy(true);
    setMessage('');
    try {
      if (active) {
        const subscription = await config.registration.pushManager.getSubscription();
        if (subscription) {
          await write('/push/subscription', { endpoint: subscription.endpoint }, 'DELETE');
          await subscription.unsubscribe();
        }
        setActive(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setMessage('Permita notificações nas configurações do navegador para receber os avisos.');
          return;
        }
        const subscription = await config.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: config.publicKey,
        });
        try {
          const { endpoint, keys } = subscription.toJSON();
          await write('/push/subscription', { endpoint, keys });
        } catch (error) {
          await subscription.unsubscribe().catch(() => {});
          throw error;
        }
        setActive(true);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível atualizar as notificações push.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!config && !message) return null;
  return (
    <div className="panel-footnote">
      {config && (
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() => void toggle()}
        >
          {active ? 'Desativar avisos neste dispositivo' : 'Ativar avisos neste dispositivo'}
        </button>
      )}
      {message && <span role="status">{message}</span>}
    </div>
  );
}
