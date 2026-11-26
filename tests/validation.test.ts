import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVehicleSchema,
  odometer,
  oilChangeSchema,
  pastDate,
  readingSchema,
  uuid,
} from '../src/server/validation.js';

const date = '2020-01-01T12:00:00Z';
const vehicle = {
  name: ' Carro ',
  plate: ' abc1d23 ',
  year: 2020,
  oilType: 'MINERAL',
  trackingMode: 'MANUAL',
  currentOdometer: 100,
  lastOilChangeKm: 100,
  lastOilChangeDate: date,
};

test('normaliza nome e placa, aceita formatos Mercosul e antigo e rejeita campos extras', () => {
  assert.deepEqual(createVehicleSchema.parse(vehicle), {
    ...vehicle,
    name: 'Carro',
    plate: 'ABC1D23',
  });
  assert.equal(createVehicleSchema.parse({ ...vehicle, plate: 'abc1234' }).plate, 'ABC1234');
  for (const invalid of [
    { name: ' x ' },
    { name: 'a'.repeat(101) },
    { plate: 'ABC-1234' },
    { year: 1949 },
    { year: new Date().getUTCFullYear() + 2 },
    { year: 2020.5 },
    { trackingMode: 'GPS' },
    { oilType: 'UNKNOWN' },
    { lastOilChangeKm: 101 },
    { role: 'ADMIN' },
  ])
    assert.equal(
      createVehicleSchema.safeParse({ ...vehicle, ...invalid }).success,
      false,
      JSON.stringify(invalid),
    );
});

test('valida limites e precisão do odômetro sem converter texto', () => {
  for (const value of [0, 0.1, 9_999_999.9]) assert.equal(odometer.parse(value), value);
  for (const value of [-0.1, 10_000_000, 0.01, NaN, Infinity, '100'])
    assert.equal(odometer.safeParse(value).success, false, String(value));
});

test('datas aceitam o instante atual e offsets, mas rejeitam futuro e ISO inválido', (t) => {
  t.mock.method(Date, 'now', () => Date.parse(date));
  for (const value of [date, '2020-01-01T09:00:00-03:00'])
    assert.equal(pastDate.parse(value), value);
  for (const value of ['2020-01-01T12:00:00.001Z', '2020-02-30T12:00:00Z', '2020-01-01T12:00:00'])
    assert.equal(pastDate.safeParse(value).success, false, value);
});

test('leitura e troca exigem seus próprios campos e rejeitam propriedades extras', () => {
  for (const source of ['MANUAL', 'OBD2'])
    assert.equal(readingSchema.parse({ odometer: 0, measuredAt: date, source }).source, source);
  assert.equal(
    readingSchema.safeParse({ odometer: 0, measuredAt: date, source: 'GPS' }).success,
    false,
  );
  assert.equal(readingSchema.safeParse({ odometer: 0, measuredAt: date }).success, false);
  const change = { odometer: 0, changedAt: date, oilType: 'SYNTHETIC' };
  assert.deepEqual(oilChangeSchema.parse(change), change);
  assert.equal(oilChangeSchema.safeParse({ ...change, source: 'MANUAL' }).success, false);
  assert.equal(uuid.safeParse('d8fc81d9-43bc-4351-a934-e264bdc906c8').success, true);
  assert.equal(uuid.safeParse('carro-inválido').success, false);
});
