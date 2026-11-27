import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CarFront,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Droplets,
  Gauge,
  LayoutDashboard,
  LayoutGrid,
  List,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  X,
} from 'lucide-react';
import type { AuditEvent, Notification, Session, Vehicle } from '../shared/domain.js';
import { OIL_LABELS } from '../shared/domain.js';
import { api, ApiError, write } from './api.js';
import { currentPushSubscription, PushSettings } from './PushSettings.js';
import { ThemeToggle } from './ThemeToggle.js';
import {
  Brand,
  CarArt,
  date,
  Empty,
  km,
  Progress,
  SectionHeading,
  Stat,
  Status,
  TextLink,
} from './components.js';
import { ActionDialog, type DialogState } from './forms.js';
import { Login } from './Login.js';
import { VehicleDetail } from './VehicleDetail.js';

type Page = 'overview' | 'vehicles' | 'history' | 'alerts';
const actionLabels: Record<string, string> = {
  VEHICLE_CREATED: 'Veículo adicionado',
  ODOMETER_UPDATED: 'Quilometragem atualizada',
  OIL_CHANGED: 'Troca de óleo registrada',
  VEHICLE_ARCHIVED: 'Veículo arquivado',
  ORGANIZATION_CREATED: 'Garagem criada',
};
const pageNames: Record<Page, string> = {
  overview: 'Visão geral',
  vehicles: 'Minha garagem',
  history: 'Histórico',
  alerts: 'Notificações',
};
const nav = [
  { id: 'overview' as const, icon: LayoutDashboard, label: 'Visão geral' },
  { id: 'vehicles' as const, icon: CarFront, label: 'Meu carro' },
  { id: 'history' as const, icon: ClipboardList, label: 'Histórico' },
  { id: 'alerts' as const, icon: Bell, label: 'Notificações' },
];
const priority = { DUE: 0, WARNING: 1, OK: 2 };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState<Page>(() =>
    new URLSearchParams(location.search).get('view') === 'alerts' ? 'alerts' : 'overview',
  );
  const [mobileMenu, setMobileMenu] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [grid, setGrid] = useState(false);
  const requestGeneration = useRef(0);
  const garage = session?.memberships.find((membership) => membership.kind === 'PERSONAL');
  const orgId = garage?.organizationId ?? '';

  useEffect(() => {
    api<Session>('/session')
      .then(setSession)
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const load = useCallback(
    async (silent = false) => {
      if (!orgId) return;
      const generation = ++requestGeneration.current;
      if (!silent) setBusy(true);
      setError('');
      try {
        const base = `/organizations/${orgId}`;
        const [dashboard, audit, alerts] = await Promise.all([
          api<{ vehicles: Vehicle[] }>(`${base}/dashboard`),
          api<{ events: AuditEvent[] }>(`${base}/audit`),
          api<{ notifications: Notification[] }>(`${base}/notifications`),
        ]);
        if (generation !== requestGeneration.current) return;
        setVehicles(dashboard.vehicles);
        setEvents(audit.events);
        setNotifications(alerts.notifications);
      } catch (e) {
        if (generation !== requestGeneration.current) return;
        if (e instanceof ApiError && e.status === 401) setSession(null);
        else setError(e instanceof Error ? e.message : 'Não foi possível carregar os dados.');
      } finally {
        if (generation === requestGeneration.current) setBusy(false);
      }
    },
    [orgId],
  );
  useEffect(() => {
    setVehicles([]);
    setEvents([]);
    setNotifications([]);
    setSelectedVehicle(null);
    setDialog(null);
    void load();
    const timer = setInterval(() => void load(true), 60_000);
    return () => {
      requestGeneration.current++;
      clearInterval(timer);
    };
  }, [load]);
  async function saved(message: string) {
    await load(true);
    setToast(message);
  }
  async function logout() {
    try {
      const subscription = await currentPushSubscription().catch(() => null);
      await write('/auth/logout', { pushEndpoint: subscription?.endpoint });
      await subscription?.unsubscribe().catch(() => {});
      requestGeneration.current++;
      setSession(null);
      setVehicles([]);
      setEvents([]);
      setNotifications([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível sair.');
    }
  }
  function navigate(value: Page) {
    setPage(value);
    setQuery('');
    setFilter('ALL');
    setMobileMenu(false);
  }
  if (authLoading)
    return (
      <div className="app-loading">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Preparando sua garagem…</p>
      </div>
    );
  if (!session)
    return (
      <Login
        onLogin={(value) => {
          setSession(value);
          navigate('overview');
        }}
      />
    );
  const displayed = vehicles
    .filter(
      (v) =>
        (filter === 'ALL' || v.status.level === filter) &&
        `${v.name} ${v.plate}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => priority[a.status.level] - priority[b.status.level]);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <span className="sidebar-caption">SUA GARAGEM</span>
        <nav aria-label="Menu principal">
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'alerts' && unread > 0 && <b>{unread}</b>}
              {item.id === 'vehicles' && (
                <small>{vehicles.length.toString().padStart(2, '0')}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="care-note">
            <span>
              <ShieldCheck size={21} />
            </span>
            <h3>Cuidado que vai longe.</h3>
            <p>Um pouco de atenção hoje. Muito mais caminho amanhã.</p>
            <span className="note-line" />
          </div>
          <button className="profile" onClick={logout} title="Sair da conta">
            <span className="avatar">
              {session.user.name
                .split(' ')
                .map((name) => name[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span>
              <strong>{session.user.name}</strong>
              <small>Garagem pessoal</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {mobileMenu && <div className="sidebar-backdrop" onClick={() => setMobileMenu(false)} />}
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Minha garagem
              <ChevronRight size={13} />
              <strong>{pageNames[page]}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Date().toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <span className="topbar-divider" />
            <ThemeToggle />
            <button
              className="icon-button notification-button"
              aria-label={`Notificações, ${unread} não lidas`}
              onClick={() => navigate('alerts')}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </button>
            <span className="avatar small">{session.user.name[0]}</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'overview'
                  ? 'TUDO PRONTO PARA O PRÓXIMO CAMINHO'
                  : 'CUIDADO EM CADA DETALHE'}
              </span>
              <h1>
                {page === 'overview'
                  ? `Olá, ${session.user.name.split(' ')[0]} 👋`
                  : pageNames[page]}
              </h1>
              <p>
                {page === 'overview'
                  ? 'Seu carro em dia. Sua rotina mais tranquila.'
                  : page === 'vehicles'
                    ? 'Cada veículo, cada cuidado, tudo no mesmo lugar.'
                    : page === 'history'
                      ? 'Uma linha do tempo dos cuidados com seus veículos.'
                      : 'Os próximos cuidados, sem deixar nada passar.'}
              </p>
            </div>
            {orgId && ['overview', 'vehicles'].includes(page) && (
              <button className="button primary" onClick={() => setDialog({ type: 'create' })}>
                <Plus size={18} />
                Adicionar veículo
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button onClick={() => void load()}>Tentar novamente</button>
            </div>
          )}
          {busy ? (
            <div className="content-loading">
              <LoaderCircle className="spin" />
              Carregando sua garagem…
            </div>
          ) : !garage ? (
            <Empty title="Não foi possível abrir sua garagem">
              Saia e entre novamente para preparar sua garagem pessoal.
            </Empty>
          ) : (
            <>
              {page === 'overview' &&
                (vehicles.length ? (
                  <PersonalDashboard
                    vehicle={vehicles[0]}
                    onAction={setDialog}
                    onSelect={setSelectedVehicle}
                    events={events}
                    onHistory={() => navigate('history')}
                    otherVehicles={vehicles.slice(1)}
                  />
                ) : (
                  <Empty
                    title="Vamos conhecer seu carro?"
                    action={
                      <button
                        className="button primary"
                        onClick={() => setDialog({ type: 'create' })}
                      >
                        <Plus size={17} />
                        Adicionar meu primeiro veículo
                      </button>
                    }
                  >
                    Adicione seu veículo e a última troca de óleo. O AutoKeep cuida da previsão.
                  </Empty>
                ))}
              {page === 'vehicles' && (
                <section className="panel vehicles-panel">
                  <div className="table-toolbar">
                    <div className="search-input">
                      <Search size={17} />
                      <input
                        placeholder="Buscar veículo ou placa"
                        aria-label="Buscar veículo"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <div className="table-filters">
                      <SlidersHorizontal size={16} />
                      <select
                        aria-label="Filtrar por situação"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="ALL">Todas as situações</option>
                        <option value="OK">Em dia</option>
                        <option value="WARNING">Atenção</option>
                        <option value="DUE">Troca vencida</option>
                      </select>
                      <div className="view-toggle">
                        <button
                          className={!grid ? 'selected' : ''}
                          onClick={() => setGrid(false)}
                          aria-label="Visualizar em lista"
                        >
                          <List size={17} />
                        </button>
                        <button
                          className={grid ? 'selected' : ''}
                          onClick={() => setGrid(true)}
                          aria-label="Visualizar em cartões"
                        >
                          <LayoutGrid size={17} />
                        </button>
                      </div>
                    </div>
                  </div>
                  {displayed.length ? (
                    grid ? (
                      <div className="vehicle-grid">
                        {displayed.map((v) => (
                          <div className="vehicle-grid-card" key={v.id}>
                            <button
                              onClick={() => setSelectedVehicle(v)}
                              className="vehicle-card-select"
                            >
                              <div>
                                <span className="plate">{v.plate}</span>
                                <Status vehicle={v} />
                              </div>
                              <CarArt compact />
                              <h3>{v.name}</h3>
                              <span>
                                {v.year} · {km(v.currentOdometer)} km
                              </span>
                            </button>
                            <Progress vehicle={v} />
                            <div className="progress-labels">
                              <span>{km(v.status.distanceRemainingKm)} km restantes</span>
                              <span>{Math.max(0, v.status.daysRemaining)} dias</span>
                            </div>
                            <button
                              className="button secondary"
                              onClick={() => setDialog({ type: 'reading', vehicle: v })}
                            >
                              <Gauge size={16} />
                              Atualizar km
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <VehicleTable
                        vehicles={displayed}
                        onSelect={setSelectedVehicle}
                        onRead={(v) => setDialog({ type: 'reading', vehicle: v })}
                      />
                    )
                  ) : (
                    <Empty
                      title={
                        vehicles.length
                          ? 'Nenhum veículo encontrado'
                          : 'A garagem está pronta para começar'
                      }
                    >
                      {vehicles.length
                        ? 'Tente outro nome, placa ou situação.'
                        : 'Use “Adicionar veículo” para cadastrar o primeiro.'}
                    </Empty>
                  )}
                  <div className="table-footer">
                    <span>
                      {displayed.length} de {vehicles.length} veículos
                    </span>
                    <span>Quilometragem real + previsão de uso</span>
                  </div>
                </section>
              )}
              {page === 'history' && (
                <section className="panel history-panel">
                  <SectionHeading title="Seu histórico de cuidados" />
                  <AuditList events={events} />
                </section>
              )}
              {page === 'alerts' && (
                <section className="panel notifications-panel">
                  <SectionHeading
                    title="Seu cuidado está no radar"
                    action={
                      unread > 0 && (
                        <button
                          className="text-link"
                          onClick={async () => {
                            try {
                              await write(`/organizations/${orgId}/notifications/read`, {});
                              await load(true);
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : 'Não foi possível marcar as notificações.',
                              );
                            }
                          }}
                        >
                          <CheckCheck size={16} />
                          Marcar como lidas
                        </button>
                      )
                    }
                  />
                  <PushSettings />
                  {notifications.length ? (
                    notifications.map((n) => (
                      <button
                        className={`notification-row ${!n.readAt ? 'unread' : ''}`}
                        key={n.id}
                        onClick={() => {
                          const vehicle = vehicles.find((v) => v.id === n.vehicleId);
                          if (vehicle) setSelectedVehicle(vehicle);
                        }}
                      >
                        <span className="notification-icon">
                          <Bell size={19} />
                        </span>
                        <span>
                          <strong>{n.title}</strong>
                          <p>{n.body}</p>
                          <small>{date(n.createdAt)}</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))
                  ) : (
                    <Empty title="Nenhum aviso por enquanto">
                      Os alertas de manutenção e lembretes de leitura aparecem aqui.
                    </Empty>
                  )}
                </section>
              )}
            </>
          )}
          <footer className="content-footer">
            <span>
              <img src="/icon-192.png" width="18" height="18" alt="" />
              Cuidado em movimento.
            </span>
            <span>
              AutoKeep <span className="footer-dot">·</span> Feito para ir mais longe
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegação móvel">
        {nav.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? 'active' : ''}
            onClick={() => navigate(item.id)}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {dialog && (
        <ActionDialog
          key={`${orgId}-${dialog.type}`}
          state={dialog}
          org={orgId}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
      {selectedVehicle && (
        <VehicleDetail
          vehicle={vehicles.find((v) => v.id === selectedVehicle.id) ?? selectedVehicle}
          org={orgId}
          onClose={() => setSelectedVehicle(null)}
          onAction={setDialog}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function VehicleTable({
  vehicles,
  onSelect,
  onRead,
}: {
  vehicles: Vehicle[];
  onSelect: (v: Vehicle) => void;
  onRead: (v: Vehicle) => void;
}) {
  if (!vehicles.length)
    return (
      <Empty title="Sem veículos por aqui">Os veículos cadastrados aparecerão neste espaço.</Empty>
    );
  return (
    <div className="table-scroll">
      <table className="vehicle-table">
        <thead>
          <tr>
            <th>Veículo</th>
            <th>
              Quilometragem <ArrowDown size={12} />
            </th>
            <th>Próxima troca</th>
            <th>Situação</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td>
                <button className="vehicle-cell" onClick={() => onSelect(v)}>
                  <span className="vehicle-thumb">
                    <CarFront size={22} />
                  </span>
                  <span>
                    <strong>{v.name}</strong>
                    <small>
                      {v.plate} <span>·</span> {v.year}
                    </small>
                  </span>
                </button>
              </td>

              <td>
                <strong className="table-km">
                  {km(v.currentOdometer)} <small>km</small>
                </strong>
                <span className="cell-caption">
                  {date(v.lastUpdateDate, { day: 'numeric', month: 'short' })}
                </span>
              </td>
              <td>
                <strong className={v.status.level === 'DUE' ? 'due-text' : ''}>
                  {v.status.level === 'DUE'
                    ? 'Troca vencida'
                    : `${km(v.status.distanceRemainingKm)} km`}
                </strong>
                <span className="cell-caption">
                  {v.status.level === 'DUE'
                    ? 'Verificar manutenção'
                    : `ou ${v.status.daysRemaining} dias`}
                </span>
              </td>
              <td>
                <Status vehicle={v} />
              </td>
              <td>
                <button
                  className="table-action"
                  title={`Atualizar quilometragem de ${v.name}`}
                  onClick={() => onRead(v)}
                >
                  <Gauge size={17} />
                  <span>Atualizar</span>
                </button>
                <button
                  className="icon-button row-more"
                  onClick={() => onSelect(v)}
                  aria-label={`Ver detalhes de ${v.name}`}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PersonalDashboard({
  vehicle: v,
  onAction,
  onSelect,
  events,
  onHistory,
  otherVehicles,
}: {
  vehicle: Vehicle;
  onAction: (s: DialogState) => void;
  onSelect: (v: Vehicle) => void;
  events: AuditEvent[];
  onHistory: () => void;
  otherVehicles: Vehicle[];
}) {
  return (
    <>
      <div className="personal-hero">
        <div className="personal-car">
          <div className="personal-car-heading">
            <span className="eyebrow">SEU COMPANHEIRO DE CAMINHO</span>
            <span className="plate">{v.plate}</span>
          </div>
          <h2>{v.name}</h2>
          <p>
            {v.year} <span>·</span> Óleo {OIL_LABELS[v.oilType].toLowerCase()}
          </p>
          <CarArt />
          <button className="car-details-link" onClick={() => onSelect(v)}>
            Conhecer os detalhes
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="personal-care">
          <div className="personal-status">
            <span className="care-icon">
              <ShieldCheck size={24} />
            </span>
            <Status vehicle={v} />
          </div>
          <span className="eyebrow">PRÓXIMA TROCA DE ÓLEO</span>
          <h2>
            {v.status.level === 'DUE'
              ? 'Hora de cuidar.'
              : v.status.level === 'WARNING'
                ? 'Já está no radar.'
                : 'Pode seguir tranquilo.'}
          </h2>
          <p>
            {v.status.level === 'DUE'
              ? 'Um dos limites da troca foi atingido. Programe a manutenção do seu veículo.'
              : 'A gente acompanha o tempo e a quilometragem. Vale o primeiro limite atingido.'}
          </p>
          <div className="next-change-numbers">
            <div>
              <strong>{km(v.status.distanceRemainingKm)}</strong>
              <span>km restantes</span>
            </div>
            <span className="or">ou</span>
            <div>
              <strong>{Math.max(0, v.status.daysRemaining)}</strong>
              <span>dias restantes</span>
            </div>
          </div>
          <Progress vehicle={v} />
          <span className="prediction-date">
            <CalendarDays size={14} />
            Previsão: {date(v.status.projectedDueDate)}
          </span>
          <div className="personal-hero-actions">
            <button
              className="button primary"
              onClick={() => onAction({ type: 'reading', vehicle: v })}
            >
              <Gauge size={17} />
              Atualizar quilometragem
            </button>
            <button className="button subtle" onClick={() => onAction({ type: 'oil', vehicle: v })}>
              Já troquei o óleo
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="stats-grid personal-stats">
        <Stat
          title="Última leitura real"
          value={
            <>
              {km(v.currentOdometer)}
              <small> km</small>
            </>
          }
          caption={`Atualizada em ${date(v.lastUpdateDate, { day: 'numeric', month: 'long' })}`}
          icon={<Gauge size={19} />}
        />
        <Stat
          title="Média de uso"
          value={
            <>
              {v.avgDailyKm > 0 ? km(v.avgDailyKm) : '—'}
              <small> km/dia</small>
            </>
          }
          caption={
            v.avgDailyKm > 0
              ? 'Baseada nas últimas leituras reais'
              : 'Informe leituras em dias diferentes'
          }
          icon={<TrendingUp size={19} />}
        />
        <Stat
          title="Última troca de óleo"
          value={date(v.lastOilChangeDate, { day: '2-digit', month: 'short' })}
          caption={`Aos ${km(v.lastOilChangeKm)} km · ${OIL_LABELS[v.oilType]}`}
          icon={<Droplets size={19} />}
        />
      </div>
      <div className="personal-lower">
        <section className="panel">
          <SectionHeading
            title="Seu histórico de cuidados"
            action={<TextLink onClick={onHistory}>Ver histórico</TextLink>}
          />
          <AuditList events={events.slice(0, 4)} />
        </section>
        <section className="reading-reminder">
          <span className="reminder-icon">
            <Gauge size={25} />
          </span>
          <span className="eyebrow">UM MINUTINHO DE CUIDADO</span>
          <h3>
            {v.calibrationDue
              ? 'Vamos atualizar a leitura?'
              : 'Quanto mais a gente sabe, melhor a gente cuida.'}
          </h3>
          <p>Uma leitura a cada 30 dias ajuda a prever a próxima troca com mais precisão.</p>
          <button
            className="button secondary"
            onClick={() => onAction({ type: 'reading', vehicle: v })}
          >
            Registrar uma leitura
            <ArrowRight size={16} />
          </button>
          <span className="calibration-step">
            <span className="step-dots">
              {[0, 1, 2].map((i) => (
                <i className={v.historicalEntries.length > i ? 'filled' : ''} key={i} />
              ))}
            </span>
            {Math.min(3, v.historicalEntries.length)} de 3 leituras para calibrar
          </span>
        </section>
      </div>
      {otherVehicles.length > 0 && (
        <section className="other-vehicles">
          <SectionHeading title="Também na sua garagem" />
          <div className="attention-grid">
            {otherVehicles.map((car) => (
              <button className="other-vehicle-card" key={car.id} onClick={() => onSelect(car)}>
                <CarFront size={25} />
                <span>
                  <strong>{car.name}</strong>
                  <small>{car.plate}</small>
                </span>
                <Status vehicle={car} />
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function AuditList({ events }: { events: AuditEvent[] }) {
  if (!events.length)
    return (
      <Empty title="Uma nova história começa aqui">
        As leituras, trocas e atualizações do seu espaço aparecerão aqui.
      </Empty>
    );
  return (
    <div className="audit-list">
      {events.map((e) => (
        <div className="audit-row" key={e.id}>
          <span className={`audit-icon ${e.action === 'OIL_CHANGED' ? 'oil' : ''}`}>
            {e.action === 'OIL_CHANGED' ? (
              <Droplets size={18} />
            ) : e.action === 'ODOMETER_UPDATED' ? (
              <Gauge size={18} />
            ) : (
              <CarFront size={18} />
            )}
          </span>
          <div>
            <strong>{actionLabels[e.action] ?? 'Atividade registrada'}</strong>
            <span>
              {e.vehicleName ? `${e.vehicleName} · ` : ''}
              {e.actorName}
            </span>
          </div>
          <time dateTime={e.createdAt}>
            {date(e.createdAt, { day: '2-digit', month: 'short' })}
          </time>
        </div>
      ))}
    </div>
  );
}
