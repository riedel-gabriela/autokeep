import assert from 'node:assert/strict';
import test from 'node:test';
import { createVehicleSchema, pastDate, readingSchema } from '../src/server/validation.js';
import { visibleReadings } from '../src/web/history.js';
import type { OilChange, Reading } from '../src/shared/domain.js';

test('datas com fusos diferentes são normalizadas antes de ordenar e persistir', () => {
  assert.equal(pastDate.parse('2025-01-01T09:00:00-03:00'), '2025-01-01T12:00:00.000Z');
  assert.equal(pastDate.parse('2025-01-01T12:00:00Z'), '2025-01-01T12:00:00.000Z');
});

test('novas leituras aceitam somente origem manual', () => {
  const reading = { odometer: 100, measuredAt: '2025-01-01T12:00:00Z' };
  assert.ok(readingSchema.safeParse({ ...reading, source: 'MANUAL' }).success);
  assert.equal(readingSchema.safeParse({ ...reading, source: 'OBD2' }).success, false);
});

test('histórico oculta apenas a leitura correspondente à mesma troca de óleo', () => {
  const reading: Reading = {
    id: 'reading',
    odometer: 100,
    measuredAt: '2025-01-01T12:00:00Z',
    source: 'MANUAL',
  };
  const change: OilChange = {
    id: 'oil',
    odometer: 100,
    changedAt: '2025-01-01T09:00:00-03:00',
    oilType: 'MINERAL',
    actorName: 'Ana',
  };
  const later = { ...reading, id: 'later', measuredAt: '2025-01-02T12:00:00Z' };
  const differentOdometer = { ...reading, id: 'other', odometer: 101 };
  assert.deepEqual(visibleReadings([reading, later, differentOdometer], [change]), [
    later,
    differentOdometer,
  ]);
  assert.deepEqual(visibleReadings([reading], []), [reading]);
});

test('novos veículos rejeitam modo OBD2 e aceitam modo manual', () => {
  const vehicle = {
    name: 'Meu carro',
    plate: 'ABC1D23',
    year: 2024,
    oilType: 'MINERAL',
    currentOdometer: 100,
    lastOilChangeKm: 0,
    lastOilChangeDate: '2025-01-01T12:00:00Z',
  };
  assert.ok(createVehicleSchema.safeParse({ ...vehicle, trackingMode: 'MANUAL' }).success);
  assert.equal(createVehicleSchema.safeParse({ ...vehicle, trackingMode: 'OBD2' }).success, false);
});
