import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowUpRight,
  CalendarDays,
  Droplets,
  Gauge,
  History,
  Pencil,
} from 'lucide-react';
import type { OilChange, Reading, Vehicle } from '../shared/domain.js';
import { OIL_LABELS } from '../shared/domain.js';
import { api } from './api.js';
import { CarArt, date, km, Modal, Progress, Status } from './components.js';
import type { DialogState } from './forms.js';

export function VehicleDetail({
  vehicle: v,
  org,
  onClose,
  onAction,
}: {
  vehicle: Vehicle;
  org: string;
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
  function action(type: 'reading' | 'oil' | 'archive') {
    onClose();
    onAction({ type, vehicle: v });
  }
  const historyEntries = [
    ...(history?.oilChanges ?? []).map((change) => ({
      id: `oil-${change.id}`,
      kind: 'oil' as const,
      date: change.changedAt,
      odometer: change.odometer,
      oilType: change.oilType,
      actorName: change.actorName,
    })),
    ...(history?.readings ?? []).map((reading) => ({
      id: `reading-${reading.id}`,
      kind: 'reading' as const,
      date: reading.measuredAt,
      odometer: reading.odometer,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
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
        </div>
        <div className="detail-actions">
          <button className="button primary" onClick={() => action('reading')}>
            <Gauge size={17} />
            Atualizar km
          </button>
          <button className="button secondary" onClick={() => action('oil')}>
            <Droplets size={17} />
            Registrar troca
          </button>
        </div>
        <h3 className="history-heading">
          <History size={18} /> Histórico
        </h3>
        {error && <div className="form-error">{error}</div>}
        {!history && !error ? (
          <p className="muted">Carregando histórico…</p>
        ) : historyEntries.length ? (
          historyEntries.map((entry) => (
            <div className="history-row" key={entry.id}>
              <span className={`history-icon ${entry.kind === 'reading' ? 'neutral' : ''}`}>
                {entry.kind === 'oil' ? <Droplets size={17} /> : <Pencil size={16} />}
              </span>
              <div>
                <strong>
                  {entry.kind === 'oil'
                    ? `Troca de óleo ${OIL_LABELS[entry.oilType].toLowerCase()}`
                    : 'Leitura de quilometragem'}
                </strong>
                <small>
                  {date(entry.date)}
                  {entry.kind === 'oil' && entry.actorName ? ` · ${entry.actorName}` : ''}
                </small>
              </div>
              <strong>
                {km(entry.odometer)} <small>km</small>
              </strong>
            </div>
          ))
        ) : (
          <p className="muted">Nenhum registro disponível.</p>
        )}
        <button className="danger-link" onClick={() => action('archive')}>
          <Archive size={15} />
          Arquivar veículo
          <ArrowUpRight size={14} />
        </button>
      </div>
    </Modal>
  );
}
