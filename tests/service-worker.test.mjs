import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const filename = fileURLToPath(new URL('../public/sw.js', import.meta.url));
const source = readFileSync(filename, 'utf8');

function worker(t) {
  const handlers = new Map();
  const self = {
    addEventListener: (name, handler) => handlers.set(name, handler),
    location: { origin: 'https://autokeep.test' },
    registration: { showNotification: t.mock.fn(async () => {}) },
    clients: { matchAll: t.mock.fn(async () => []), openWindow: t.mock.fn(async () => {}) },
  };
  runInNewContext(source, { self, URL }, { filename });
  const dispatch = async (name, payload) => {
    let pending;
    handlers.get(name)({
      ...payload,
      waitUntil: (promise) => {
        pending = promise;
      },
    });
    await pending;
  };
  return { self, dispatch };
}

test('o service worker ignora push vazio e exibe aviso com identificação estável', async (t) => {
  const { self, dispatch } = worker(t);
  await dispatch('push', {});
  assert.equal(self.registration.showNotification.mock.callCount(), 0);
  await dispatch('push', {
    data: { json: () => ({ title: 'Troca de óleo', body: 'Faltam 500 km', id: 'cycle' }) },
  });
  const [title, options] = self.registration.showNotification.mock.calls[0].arguments;
  assert.equal(title, 'Troca de óleo');
  assert.deepEqual({ ...options }, { body: 'Faltam 500 km', tag: 'cycle', icon: '/icon-192.png' });
});

test('clicar no aviso fecha a notificação e abre ou focaliza a caixa de avisos', async (t) => {
  const { self, dispatch } = worker(t);
  const close = t.mock.fn();
  const focus = t.mock.fn(async () => {});
  const url = 'https://autokeep.test/?view=alerts';
  await dispatch('notificationclick', { notification: { close } });
  assert.equal(self.clients.openWindow.mock.calls[0].arguments[0], url);
  self.clients.matchAll.mock.mockImplementation(async () => [{ url, focus }]);
  await dispatch('notificationclick', { notification: { close } });
  assert.equal(focus.mock.callCount(), 1);
  assert.equal(close.mock.callCount(), 2);
  assert.equal(self.clients.openWindow.mock.callCount(), 1);
});
