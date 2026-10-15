import { randomUUID } from 'node:crypto';
import { pool, rows } from './db.js';
import { visibleVehicles } from './repository.js';
import { sendMail } from './mail.js';

// Entrada independente de HTTP; poderá ser chamada por EventBridge/Lambda.
export async function evaluateMaintenance() {
  const organizations = await rows<{ id: string; adminId: string }>(
    pool,
    "SELECT o.id, MIN(m.user_id) AS adminId FROM organizations o JOIN memberships m ON m.organization_id=o.id AND m.role='ADMIN' GROUP BY o.id",
  );
  for (const org of organizations) {
    for (const v of await visibleVehicles(org.id, org.adminId)) {
      if (v.status.level === 'OK' && !v.calibrationDue) continue;
      const title =
        v.status.level === 'DUE'
          ? 'Hora de trocar o óleo'
          : v.status.level === 'WARNING'
            ? 'Próxima troca no radar'
            : 'Atualize sua quilometragem';
      const body =
        v.status.level !== 'OK'
          ? `${v.name} · ${v.plate}: ${Math.max(0, Math.floor(v.status.distanceRemainingKm)).toLocaleString('pt-BR')} km ou ${Math.max(0, v.status.daysRemaining)} dias para a troca. Vale o primeiro limite atingido.`
          : `${v.name}: uma nova leitura deixa a previsão da próxima troca mais precisa.`;
      // Um aviso por nível/ciclo/destinatário; o pré-aviso evolui para vencimento.
      const key = `${v.id}:${v.lastOilChangeDate}:${v.status.level}:${v.calibrationDue ? 'calibration' : 'maintenance'}`;
      const recipients = await rows<{ id: string; email: string }>(
        pool,
        "SELECT u.id,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND (m.role='ADMIN' OR m.user_id=?)",
        [org.id, v.assignedDriverId],
      );
      for (const recipient of recipients) {
        await pool.execute(
          'INSERT IGNORE INTO notifications (id,organization_id,vehicle_id,user_id,event_key,title,body) VALUES (?,?,?,?,?,?,?)',
          [randomUUID(), org.id, v.id, recipient.id, key, title, body],
        );
        const [pending] = await rows<{ id: string }>(
          pool,
          'SELECT id FROM notifications WHERE user_id=? AND event_key=? AND email_sent_at IS NULL',
          [recipient.id, key],
        );
        if (pending) {
          try {
            await sendMail(recipient.email, `${title} — ${v.name}`, body);
            await pool.execute(
              'UPDATE notifications SET email_sent_at=UTC_TIMESTAMP(3) WHERE id=?',
              [pending.id],
            );
          } catch {
            console.error(
              JSON.stringify({ event: 'notification_mail_failed', code: 'LOCAL_SMTP_UNAVAILABLE' }),
            );
          }
        }
      }
    }
  }
}
