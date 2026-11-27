import { AlertCircle } from 'lucide-react';
import type { Vehicle } from '../shared/domain.js';
import { OIL_LABELS } from '../shared/domain.js';
import { api, write } from './api.js';
import { dayIso, Form, km, Modal, nowInput, todayInput } from './components.js';

export type DialogState =
  { type: 'create' } | { type: 'reading' | 'oil' | 'archive'; vehicle: Vehicle };
function OilOptions() {
  return (
    <>
      {Object.entries(OIL_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label} ·{' '}
          {value === 'MINERAL' ? '5.000' : value === 'SEMI_SYNTHETIC' ? '8.000' : '12.000'} km
        </option>
      ))}
    </>
  );
}
export function ActionDialog({
  state,
  org,
  onClose,
  onSaved,
}: {
  state: DialogState;
  org: string;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const base = `/organizations/${org}`;
  const v = 'vehicle' in state ? state.vehicle : null;
  const finish = async (message: string) => {
    await onSaved(message);
    onClose();
  };
  if (state.type === 'create')
    return (
      <Modal
        title="Adicionar veículo"
        subtitle="O primeiro passo para manter tudo em dia."
        onClose={onClose}
      >
        <Form
          label="Adicionar veículo"
          onCancel={onClose}
          onSubmit={async (data) => {
            await write(`${base}/vehicles`, {
              name: data.get('name'),
              plate: String(data.get('plate'))
                .replace(/[^a-z0-9]/gi, '')
                .toUpperCase(),
              year: Number(data.get('year')),
              oilType: data.get('oilType'),
              trackingMode: 'MANUAL',
              currentOdometer: Number(data.get('odometer')),
              lastOilChangeKm: Number(data.get('changeKm')),
              lastOilChangeDate: dayIso(String(data.get('changeDate'))),
            });
            await finish('Veículo adicionado à garagem.');
          }}
        >
          <label>
            Nome do veículo
            <input
              name="name"
              placeholder="Ex.: Volkswagen Nivus"
              required
              minLength={2}
              maxLength={100}
              autoFocus
            />
          </label>
          <div className="form-grid">
            <label>
              Placa
              <input
                name="plate"
                placeholder="ABC1D23"
                required
                pattern="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}"
                maxLength={7}
                className="uppercase"
              />
            </label>
            <label>
              Ano
              <input
                name="year"
                type="number"
                defaultValue={new Date().getFullYear()}
                min={1950}
                max={new Date().getFullYear() + 1}
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Quilometragem atual
              <input
                name="odometer"
                type="number"
                placeholder="32.480"
                min={0}
                max={9999999}
                step="0.1"
                required
              />
            </label>
          </div>
          <div className="form-divider">Última troca de óleo</div>
          <label>
            Tipo de óleo
            <select name="oilType" defaultValue="SYNTHETIC">
              <OilOptions />
            </select>
          </label>
          <div className="form-grid">
            <label>
              Quilometragem da troca
              <input name="changeKm" type="number" min={0} max={9999999} step="0.1" required />
            </label>
            <label>
              Data da troca
              <input name="changeDate" type="date" max={todayInput()} required />
            </label>
          </div>
          <p className="field-hint">
            Informe os dados do painel. A troca vence por quilometragem ou após 365 dias, o que
            acontecer primeiro.
          </p>
        </Form>
      </Modal>
    );
  if (state.type === 'reading' && v)
    return (
      <Modal title="Atualizar quilometragem" subtitle={`${v.name} · ${v.plate}`} onClose={onClose}>
        <Form
          label="Salvar leitura"
          onCancel={onClose}
          onSubmit={async (data) => {
            await write(`${base}/vehicles/${v.id}/odometer`, {
              odometer: Number(data.get('odometer')),
              measuredAt: new Date(String(data.get('measuredAt'))).toISOString(),
              source: 'MANUAL',
            });
            await finish('Quilometragem atualizada. Previsão recalculada.');
          }}
        >
          <div className="info-note">
            <AlertCircle size={18} />
            <span>
              Última leitura real: <strong>{km(v.currentOdometer)} km</strong>. Informe a
              quilometragem total do painel.
            </span>
          </div>
          <label>
            Quilometragem atual (km)
            <input
              name="odometer"
              type="number"
              min={v.currentOdometer}
              max={9999999}
              step="0.1"
              placeholder={String(Math.round(v.currentOdometer))}
              required
              autoFocus
            />
          </label>
          <label>
            Data e hora da leitura
            <input
              name="measuredAt"
              type="datetime-local"
              step="1"
              defaultValue={nowInput()}
              required
            />
          </label>
          <p className="field-hint">
            A leitura é registrada manualmente a partir do painel do veículo.
          </p>
        </Form>
      </Modal>
    );
  if (state.type === 'oil' && v)
    return (
      <Modal
        title="Registrar troca de óleo"
        subtitle={`${v.name} · um novo ciclo de cuidado`}
        onClose={onClose}
      >
        <Form
          label="Registrar troca"
          onCancel={onClose}
          onSubmit={async (data) => {
            await write(`${base}/vehicles/${v.id}/oil-changes`, {
              odometer: Number(data.get('odometer')),
              changedAt: new Date(String(data.get('changedAt'))).toISOString(),
              oilType: data.get('oilType'),
            });
            await finish('Troca registrada. Um novo ciclo começou.');
          }}
        >
          <label>
            Quilometragem na troca
            <input
              name="odometer"
              type="number"
              min={v.lastOilChangeKm}
              max={9999999}
              step="0.1"
              defaultValue={v.currentOdometer}
              required
              autoFocus
            />
          </label>
          <label>
            Data e hora da troca
            <input
              name="changedAt"
              type="datetime-local"
              step="1"
              defaultValue={nowInput()}
              required
            />
          </label>
          <label>
            Óleo utilizado
            <select name="oilType" defaultValue={v.oilType}>
              <OilOptions />
            </select>
          </label>
          <div className="info-note">
            <AlertCircle size={18} />
            <span>
              O histórico será preservado. O próximo vencimento considera o novo óleo e a data desta
              troca.
            </span>
          </div>
        </Form>
      </Modal>
    );
  if (state.type === 'archive' && v)
    return (
      <Modal title="Arquivar veículo?" subtitle={v.name} onClose={onClose}>
        <Form
          label="Arquivar veículo"
          onCancel={onClose}
          onSubmit={async () => {
            await api(`${base}/vehicles/${v.id}`, { method: 'DELETE', body: '{}' });
            await finish('Veículo arquivado. Histórico preservado.');
          }}
        >
          <p>
            O veículo sairá da garagem ativa e deixará de emitir alertas. O histórico de manutenção
            e auditoria continuará guardado.
          </p>
        </Form>
      </Modal>
    );
  return null;
}
