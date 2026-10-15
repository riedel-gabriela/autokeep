import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowUpRight,
  CalendarDays,
  Droplets,
  Gauge,
  History,
  Pencil,
  UserRound,
} from 'lucide-react';
import type { OilChange, Reading, Vehicle } from '../shared/domain.js';
import { OIL_LABELS } from '../shared/domain.js';
import { api } from './api.js';
import { CarArt, date, km, Modal, Progress, Status } from './components.js';
import type { DialogState } from './forms.js';

export function VehicleDetail({
  vehicle: v,
  org,
  canManage,
  fleet,
  onClose,
  onAction,
}: {
  vehicle: Vehicle;
  org: string;
  canManage: boolean;
  fleet: boolean;
  onClose: () => void;
  onAction: (state: DialogState) => void;
}) {
  const [history, setHistory] = useState<{ readings: Reading[]; oilChanges: OilChange[] } | null>(
      null,
    ),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<{ readings: Reading[]; oilChanges: OilChange[] }>(
      `/organizations/${org}/vehicles/${v.id}/history`,
    )
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [org, v.id, v.lastUpdateDate, v.lastOilChangeDate]);
  function action(type: 'reading' | 'oil' | 'assign' | 'archive') {
    onClose();
    onAction({ type, vehicle: v });
  }
  return (
    <Modal title={v.name} subtitle={`${v.plate} · ${v.year}`} onClose={onClose}>
      <div className="vehicle-detail">
        <div className="detail-illustration">
          <Status vehicle={v} />
          <CarArt compact />
        </div>
        <div className="detail-metrics">
          <div>
            <span>Última leitura real</span>
            <strong>
              {km(v.currentOdometer)} <small>km</small>
            </strong>
            <small>{date(v.lastUpdateDate)}</small>
          </div>
          <div>
            <span>Estimativa de hoje</span>
            <strong>
              {km(v.predictedOdometer)} <small>km</small>
            </strong>
            <small>
              {v.avgDailyKm > 0
                ? `Média de ${km(v.avgDailyKm)} km/dia`
                : 'Aguardando mais leituras'}
            </small>
          </div>
        </div>
        <div className="detail-maintenance">
          <div>
            <span className="eyebrow">PRÓXIMA TROCA</span>
            <strong>{date(v.status.projectedDueDate)}</strong>
          </div>
          <Status vehicle={v} />
        </div>
        <Progress vehicle={v} />
        <div className="progress-labels">
          <span>{km(v.status.distanceRemainingKm)} km restantes</span>
          <span>{Math.max(0, v.status.daysRemaining)} dias restantes</span>
        </div>
        <p className="field-hint">
          A previsão usa até três leituras reais. Vale o primeiro limite atingido, por tempo ou
          distância.
        </p>
        <div className="detail-info">
          <span>
            <Droplets size={16} />
            Óleo {OIL_LABELS[v.oilType].toLowerCase()}
          </span>
          <span>
            <CalendarDays size={16} />
            Última troca em {date(v.lastOilChangeDate)}
          </span>
          {fleet && (
            <span>
              <UserRound size={16} />
              {v.assignedDriverName ?? 'Sem motorista atribuído'}
            </span>
          )}
        </div>
        <div className="detail-actions">
          <button className="button primary" onClick={() => action('reading')}>
            <Gauge size={17} />
            Atualizar km
          </button>
          {canManage && (
            <button className="button secondary" onClick={() => action('oil')}>
              <Droplets size={17} />
              Registrar troca
            </button>
          )}
          {canManage && fleet && (
            <button className="button secondary" onClick={() => action('assign')}>
              <UserRound size={17} />
              Motorista
            </button>
          )}
        </div>
        <h3 className="history-heading">
          <History size={18} /> Histórico de manutenção
        </h3>
        {error && <div className="form-error">{error}</div>}
        {!history && !error ? (
          <p className="muted">Carregando histórico…</p>
        ) : (
          history?.oilChanges.map((change) => (
            <div className="history-row" key={change.id}>
              <span className="history-icon">
                <Droplets size={17} />
              </span>
              <div>
                <strong>Troca de óleo {OIL_LABELS[change.oilType].toLowerCase()}</strong>
                <small>
                  {date(change.changedAt)} · {change.actorName}
                </small>
              </div>
              <strong>
                {km(change.odometer)} <small>km</small>
              </strong>
            </div>
          ))
        )}
        <h3 className="history-heading">
          <Gauge size={18} /> Leituras de quilometragem
        </h3>
        {history?.readings.map((reading) => (
          <div className="history-row" key={reading.id}>
            <span className="history-icon neutral">
              <Pencil size={16} />
            </span>
            <div>
              <strong>{reading.source === 'OBD2' ? 'OBD2 confirmado' : 'Leitura manual'}</strong>
              <small>{date(reading.measuredAt)}</small>
            </div>
            <strong>
              {km(reading.odometer)} <small>km</small>
            </strong>
          </div>
        ))}
        {canManage && (
          <button className="danger-link" onClick={() => action('archive')}>
            <Archive size={15} />
            Arquivar veículo
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </Modal>
  );
}
