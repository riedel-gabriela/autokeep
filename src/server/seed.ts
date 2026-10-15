import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { config } from './config.js';
import { pool, rows, transaction } from './db.js';
import { DAY, type OilType } from '../shared/domain.js';

export async function seed() {
  if (config.SEED_DEMO !== 'true') return;
  const passwordHash = await hash(config.DEMO_PASSWORD, 12);
  await transaction(async (db) => {
    // A primeira organização também funciona como marcador; nunca reescreva dados existentes.
    if ((await rows(db, 'SELECT id FROM organizations LIMIT 1')).length) return;
    const ana = randomUUID(),
      marina = randomUUID(),
      lucas = randomUUID(),
      julia = randomUUID(),
      rafael = randomUUID();
    for (const [id, name, email] of [
      [ana, 'Ana Souza', 'ana@autokeep.local'],
      [marina, 'Marina Costa', 'marina@autokeep.local'],
      [lucas, 'Lucas Almeida', 'lucas@autokeep.local'],
      [julia, 'Júlia Santos', 'julia@autokeep.local'],
      [rafael, 'Rafael Lima', 'rafael@autokeep.local'],
    ]) {
      await db.execute('INSERT INTO users (id,name,email,password_hash) VALUES (?,?,?,?)', [
        id,
        name,
        email,
        passwordHash,
      ]);
    }
    const personal = randomUUID(),
      fleet = randomUUID();
    await db.execute('INSERT INTO organizations (id,name,kind) VALUES (?,?,?),(?,?,?)', [
      personal,
      'Minha garagem',
      'PERSONAL',
      fleet,
      'Horizonte Logística',
      'FLEET',
    ]);
    for (const [orgId, userId, role] of [
      [personal, ana, 'ADMIN'],
      [fleet, marina, 'ADMIN'],
      [fleet, lucas, 'DRIVER'],
      [fleet, julia, 'DRIVER'],
      [fleet, rafael, 'DRIVER'],
    ]) {
      await db.execute('INSERT INTO memberships (organization_id,user_id,role) VALUES (?,?,?)', [
        orgId,
        userId,
        role,
      ]);
    }
    const now = new Date();
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    const cars: {
      org: string;
      name: string;
      plate: string;
      year: number;
      oil: OilType;
      km: number;
      changeKm: number;
      changeDays: number;
      rate: number;
      driver: string | null;
      actor: string;
    }[] = [
      {
        org: personal,
        name: 'Volkswagen Nivus',
        plate: 'ABC1D23',
        year: 2023,
        oil: 'SYNTHETIC',
        km: 32480,
        changeKm: 27500,
        changeDays: 125,
        rate: 39,
        driver: null,
        actor: ana,
      },
      {
        org: fleet,
        name: 'Fiat Strada',
        plate: 'GHT4J82',
        year: 2024,
        oil: 'SEMI_SYNTHETIC',
        km: 48360,
        changeKm: 40000,
        changeDays: 150,
        rate: 58,
        driver: lucas,
        actor: marina,
      },
      {
        org: fleet,
        name: 'Renault Kangoo',
        plate: 'FPL2C19',
        year: 2022,
        oil: 'SYNTHETIC',
        km: 71450,
        changeKm: 60000,
        changeDays: 200,
        rate: 52,
        driver: julia,
        actor: marina,
      },
      {
        org: fleet,
        name: 'Chevrolet Onix',
        plate: 'JKL5M67',
        year: 2023,
        oil: 'SYNTHETIC',
        km: 36500,
        changeKm: 31000,
        changeDays: 342,
        rate: 27,
        driver: rafael,
        actor: marina,
      },
      {
        org: fleet,
        name: 'Volkswagen Saveiro',
        plate: 'DRE8F54',
        year: 2024,
        oil: 'SEMI_SYNTHETIC',
        km: 25900,
        changeKm: 23000,
        changeDays: 82,
        rate: 35,
        driver: null,
        actor: marina,
      },
      {
        org: fleet,
        name: 'Fiat Fiorino',
        plate: 'BCA9E31',
        year: 2021,
        oil: 'MINERAL',
        km: 92300,
        changeKm: 90800,
        changeDays: 45,
        rate: 34,
        driver: lucas,
        actor: marina,
      },
      {
        org: fleet,
        name: 'Toyota Corolla',
        plate: 'KDE3G21',
        year: 2025,
        oil: 'SYNTHETIC',
        km: 18200,
        changeKm: 15000,
        changeDays: 105,
        rate: 29,
        driver: null,
        actor: marina,
      },
    ];
    for (const car of cars) {
      const id = randomUUID();
      await db.execute(
        "INSERT INTO vehicles (id,organization_id,name,plate,year,oil_type,tracking_mode,current_odometer,last_update_date,last_oil_change_km,last_oil_change_date,assigned_driver_id) VALUES (?,?,?,?,?,?,'MANUAL',?,?,?,?,?)",
        [
          id,
          car.org,
          car.name,
          car.plate,
          car.year,
          car.oil,
          car.km,
          ago(2),
          car.changeKm,
          ago(car.changeDays),
          car.driver,
        ],
      );
      for (const days of [62, 32, 2])
        await db.execute(
          "INSERT INTO readings (id,vehicle_id,odometer,measured_at,source,actor_id) VALUES (?,?,?,?,'MANUAL',?)",
          [randomUUID(), id, car.km - car.rate * (days - 2), ago(days), car.actor],
        );
      await db.execute(
        'INSERT INTO oil_changes (id,vehicle_id,odometer,changed_at,oil_type,actor_id) VALUES (?,?,?,?,?,?)',
        [randomUUID(), id, car.changeKm, ago(car.changeDays), car.oil, car.actor],
      );
      await db.execute(
        "INSERT INTO audit_logs (id,organization_id,actor_id,vehicle_id,action) VALUES (?,?,?,?,'VEHICLE_CREATED')",
        [randomUUID(), car.org, car.actor, id],
      );
    }
  });
  await pool.execute('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP(3)');
}
