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
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Droplets,
  Gauge,
  LayoutDashboard,
  LayoutGrid,
  List,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { AuditEvent, Member, Notification, Session, Vehicle } from '../shared/domain.js';
import { OIL_LABELS } from '../shared/domain.js';
import { api, ApiError, write } from './api.js';
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

type Page = 'overview' | 'vehicles' | 'drivers' | 'history' | 'alerts';
const actionLabels: Record<string, string> = {
  VEHICLE_CREATED: 'Veículo adicionado',
  ODOMETER_UPDATED: 'Quilometragem atualizada',
  OIL_CHANGED: 'Troca de óleo registrada',
  DRIVER_ASSIGNED: 'Motorista atualizado',
  VEHICLE_ARCHIVED: 'Veículo arquivado',
  MEMBER_REMOVED: 'Motorista removido',
  INVITATION_CREATED: 'Convite criado',
  INVITATION_ACCEPTED: 'Convite aceito',
  ORGANIZATION_CREATED: 'Espaço criado',
};
const priority = { DUE: 0, WARNING: 1, OK: 2 };

export function App() {
  const [session, setSession] = useState<Session | null>(null),
    [authLoading, setAuthLoading] = useState(true);
  const [orgId, setOrgId] = useState(''),
    [page, setPage] = useState<Page>('overview'),
    [mobileMenu, setMobileMenu] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [events, setEvents] = useState<AuditEvent[]>([]),
    [notifications, setNotifications] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null),
    [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('ALL'),
    [grid, setGrid] = useState(false);
  const [invitation, setInvitation] = useState<string | null>(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('invite');
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  });
  const requestGeneration = useRef(0);
  const membership =
    session?.memberships.find((m) => m.organizationId === orgId) ?? session?.memberships[0];
  const fleet = membership?.kind === 'FLEET',
    canManage = membership?.role === 'ADMIN';
  useEffect(() => {
    api<Session>('/session')
      .then((s) => {
        setSession(s);
        setOrgId(s.memberships[0]?.organizationId ?? '');
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(''), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const load = useCallback(
    async (silent = false) => {
      if (!orgId || !membership) return;
      const generation = ++requestGeneration.current;
      if (!silent) setBusy(true);
      setError('');
      try {
        const base = `/organizations/${orgId}`;
        const [dashboard, people, audit, alerts] = await Promise.all([
          api<{ vehicles: Vehicle[] }>(`${base}/dashboard`),
          membership.role === 'ADMIN'
            ? api<{ members: Member[] }>(`${base}/members`)
            : Promise.resolve({ members: [] }),
          membership.role === 'ADMIN'
            ? api<{ events: AuditEvent[] }>(`${base}/audit`)
            : Promise.resolve({ events: [] }),
          api<{ notifications: Notification[] }>(`${base}/notifications`),
        ]);
        if (generation !== requestGeneration.current) return;
        setVehicles(dashboard.vehicles);
        setMembers(people.members);
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
    [orgId, membership?.role],
  );
  useEffect(() => {
    setVehicles([]);
    setMembers([]);
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
    const current = await api<Session>('/session');
    setSession(current);
    if (!orgId) setOrgId(current.memberships[0]?.organizationId ?? '');
    await load(true);
    setToast(message);
  }
  async function logout() {
    try {
      await write('/auth/logout', {});
      setSession(null);
      setVehicles([]);
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
  async function acceptInvite() {
    try {
      await write('/invitations/accept', { token: invitation });
      setInvitation(null);
      history.replaceState(null, '', location.pathname);
      const current = await api<Session>('/session');
      setSession(current);
      setOrgId(current.memberships[current.memberships.length - 1]?.organizationId ?? '');
      setToast('Convite aceito. Bem-vindo à frota!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.');
    }
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
        invitation={invitation}
        onInvitationConsumed={() => {
          setInvitation(null);
          history.replaceState(null, '', location.pathname);
        }}
        onLogin={(s) => {
          setSession(s);
          setOrgId(s.memberships[0]?.organizationId ?? '');
          navigate('overview');
        }}
      />
    );
  const attention = vehicles.filter((v) => v.status.level !== 'OK');
  const due = vehicles.filter((v) => v.status.level === 'DUE');
  const displayed = [...vehicles]
    .filter(
      (v) =>
        (filter === 'ALL' || v.status.level === filter) &&
        `${v.name} ${v.plate} ${v.assignedDriverName ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => priority[a.status.level] - priority[b.status.level]);
  const unread = notifications.filter((n) => !n.readAt).length;
  const pageNames: Record<Page, string> = {
    overview: 'Visão geral',
    vehicles: fleet ? 'Veículos' : 'Minha garagem',
    drivers: 'Motoristas',
    history: 'Histórico',
    alerts: 'Notificações',
  };
  const nav = [
    { id: 'overview' as const, icon: LayoutDashboard, label: 'Visão geral' },
    { id: 'vehicles' as const, icon: CarFront, label: fleet ? 'Veículos' : 'Meu carro' },
    ...(fleet && canManage
      ? [{ id: 'drivers' as const, icon: UsersRound, label: 'Motoristas' }]
      : []),
    ...(canManage ? [{ id: 'history' as const, icon: ClipboardList, label: 'Histórico' }] : []),
    { id: 'alerts' as const, icon: Bell, label: 'Notificações' },
  ];
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
        <span className="sidebar-caption">SEU ESPAÇO</span>
        <div className="workspace-selector">
          <span className="workspace-icon">
            {fleet ? <UsersRound size={18} /> : <CarFront size={18} />}
          </span>
          <select
            aria-label="Selecionar garagem ou frota"
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              navigate('overview');
            }}
          >
            {session.memberships.map((m) => (
              <option key={m.organizationId} value={m.organizationId}>
                {m.companyName}
              </option>
            ))}
            {!session.memberships.length && <option value="">Sem espaço</option>}
          </select>
          <ChevronDown size={14} />
        </div>
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
        <button className="new-workspace" onClick={() => setDialog({ type: 'organization' })}>
          <Plus size={15} />
          Criar outro espaço
        </button>
        <div className="sidebar-bottom">
          <div className="care-note">
            <span>
              <ShieldCheck size={21} />
            </span>
            <h3>Cuidado que vai longe.</h3>
            <p>Um pouco de atenção hoje. Muito mais caminho amanhã.</p>
            <span className="note-line" />
          </div>
          <a className="support-link" href="http://localhost:8025" target="_blank" rel="noreferrer">
            <Mail size={17} />
            Caixa de e-mails
            <ArrowUpRight size={14} />
          </a>
          <button className="profile" onClick={logout} title="Sair da conta">
            <span className="avatar">
              {session.user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span>
              <strong>{session.user.name}</strong>
              <small>
                {canManage ? (fleet ? 'Gestora de frota' : 'Garagem pessoal') : 'Motorista'}
              </small>
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
              {fleet ? 'Minha frota' : 'Minha garagem'}
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
          {invitation && (
            <div className="invite-banner">
              <Mail size={20} />
              <div>
                <strong>Você recebeu um convite para uma frota.</strong>
                <span>Aceite usando a conta com o e-mail convidado.</span>
              </div>
              <button className="button primary" onClick={acceptInvite}>
                Aceitar convite
              </button>
              <button
                className="icon-button"
                aria-label="Dispensar convite"
                onClick={() => {
                  setInvitation(null);
                  history.replaceState(null, '', location.pathname);
                }}
              >
                <X size={18} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'overview'
                  ? 'TUDO PRONTO PARA O PRÓXIMO CAMINHO'
                  : 'CUIDADO EM CADA DETALHE'}
              </span>
              <h1>
                {page === 'overview'
                  ? `Olá, ${session.user.name.split(' ')[0]} ${fleet ? '' : '👋'}`
                  : pageNames[page]}
              </h1>
              <p>
                {page === 'overview'
                  ? fleet
                    ? 'Veja como está sua frota e o que precisa de atenção hoje.'
                    : 'Seu carro em dia. Sua rotina mais tranquila.'
                  : page === 'vehicles'
                    ? 'Cada veículo, cada cuidado, tudo no mesmo lugar.'
                    : page === 'drivers'
                      ? 'Conecte sua equipe aos veículos da frota.'
                      : page === 'history'
                        ? 'Uma linha do tempo dos cuidados com seus veículos.'
                        : 'Os próximos cuidados, sem deixar nada passar.'}
              </p>
            </div>
            {canManage && ['overview', 'vehicles'].includes(page) && (
              <button className="button primary" onClick={() => setDialog({ type: 'create' })}>
                <Plus size={18} />
                Adicionar veículo
              </button>
            )}
            {canManage && page === 'drivers' && (
              <button className="button primary" onClick={() => setDialog({ type: 'invite' })}>
                <Plus size={18} />
                Convidar motorista
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
              Carregando seu espaço…
            </div>
          ) : !membership ? (
            <Empty
              title="Seu próximo caminho começa aqui"
              action={
                <button
                  className="button primary"
                  onClick={() => setDialog({ type: 'organization' })}
                >
                  <Plus size={17} />
                  Criar meu espaço
                </button>
              }
            >
              Crie uma garagem pessoal ou uma frota para começar.
            </Empty>
          ) : (
            <>
              {page === 'overview' &&
                (fleet ? (
                  <>
                    <div className="stats-grid">
                      <Stat
                        title="Veículos na frota"
                        value={vehicles.length.toString().padStart(2, '0')}
                        caption="Veículos ativos no seu espaço"
                        icon={<CarFront size={19} />}
                      />
                      <Stat
                        title="Em dia"
                        value={(vehicles.length - attention.length).toString().padStart(2, '0')}
                        caption="Prontos para seguir viagem"
                        icon={<ShieldCheck size={19} />}
                        tone="green"
                      />
                      <Stat
                        title="Precisam de atenção"
                        value={attention.length.toString().padStart(2, '0')}
                        caption={`${due.length} ${due.length === 1 ? 'troca vencida' : 'trocas vencidas'} · ${attention.length - due.length} próximas`}
                        icon={<AlertTriangle size={19} />}
                        tone="amber"
                      />
                      <Stat
                        title={canManage ? 'Motoristas' : 'Seus veículos'}
                        value={(canManage
                          ? members.filter((m) => m.role === 'DRIVER').length
                          : vehicles.length
                        )
                          .toString()
                          .padStart(2, '0')}
                        caption={
                          canManage ? 'Pessoas que movem a sua frota' : 'Veículos atribuídos a você'
                        }
                        icon={<UsersRound size={19} />}
                      />
                    </div>
                    <section className="attention-section">
                      <SectionHeading
                        eyebrow="UM OLHAR MAIS ATENTO"
                        title="No radar da manutenção"
                        action={
                          <TextLink
                            onClick={() => {
                              navigate('vehicles');
                              setFilter('WARNING');
                            }}
                          >
                            Ver veículos
                          </TextLink>
                        }
                      />
                      {attention.length ? (
                        <div className="attention-grid">
                          {attention.slice(0, 3).map((v) => (
                            <AttentionCard
                              key={v.id}
                              v={v}
                              onSelect={() => setSelectedVehicle(v)}
                              onAction={() =>
                                setDialog({ type: canManage ? 'oil' : 'reading', vehicle: v })
                              }
                              canManage={canManage}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="all-good">
                          <ShieldCheck size={27} />
                          <div>
                            <h3>Tudo em dia por aqui.</h3>
                            <p>Seus veículos estão prontos para o próximo caminho.</p>
                          </div>
                          <Sparkles size={21} />
                        </div>
                      )}
                    </section>
                    <div className="fleet-main">
                      <section className="panel fleet-table-panel">
                        <SectionHeading
                          title="Sua frota"
                          action={
                            <TextLink onClick={() => navigate('vehicles')}>Ver todos</TextLink>
                          }
                        />
                        <VehicleTable
                          vehicles={displayed}
                          fleet={fleet}
                          onSelect={setSelectedVehicle}
                          onRead={(v) => setDialog({ type: 'reading', vehicle: v })}
                        />
                      </section>
                      <aside className="fleet-insights">
                        <div className="insight-card">
                          <div className="insight-title">
                            <TrendingUp size={18} />
                            <span>UM CUIDADO A MAIS</span>
                          </div>
                          <h3>Prevenir é o melhor caminho.</h3>
                          <p>
                            Trocar o óleo no momento certo ajuda a preservar o motor e evitar
                            paradas inesperadas.
                          </p>
                          <div className="insight-divider" />
                          <div className="insight-numbers">
                            <strong>
                              {vehicles.length
                                ? Math.round(
                                    ((vehicles.length - attention.length) / vehicles.length) * 100,
                                  )
                                : 0}
                              %
                            </strong>
                            <span>
                              da frota com a<br />
                              manutenção em dia
                            </span>
                          </div>
                        </div>
                        <div className="calibration-note">
                          <Gauge size={23} />
                          <h3>Uma leitura faz a diferença.</h3>
                          <p>
                            Atualize a quilometragem a cada 30 dias para ter previsões mais
                            precisas.
                          </p>
                          <TextLink onClick={() => navigate('vehicles')}>
                            Atualizar leituras
                          </TextLink>
                        </div>
                      </aside>
                    </div>
                  </>
                ) : vehicles.length ? (
                  <PersonalDashboard
                    vehicle={vehicles[0]}
                    canManage={canManage}
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
                        placeholder="Buscar veículo, placa ou motorista"
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
                        fleet={fleet}
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
                        : canManage
                          ? 'Use “Adicionar veículo” para cadastrar o primeiro.'
                          : 'O gestor poderá atribuir um veículo a você.'}
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
              {page === 'drivers' && canManage && (
                <section className="panel">
                  <div className="table-toolbar">
                    <h2>
                      Equipe da frota <span className="count-pill">{members.length}</span>
                    </h2>
                    <span className="muted">As atribuições preservam o histórico do veículo.</span>
                  </div>
                  <div className="members-list">
                    {members.map((m) => (
                      <div className="member-row" key={m.id}>
                        <span className="avatar">
                          {m.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                        <div className="member-name">
                          <strong>{m.name}</strong>
                          <small>{m.email}</small>
                        </div>
                        <span className={`role-pill ${m.role === 'ADMIN' ? 'admin' : ''}`}>
                          {m.role === 'ADMIN' ? 'Gestor' : 'Motorista'}
                        </span>
                        <span className="member-count">
                          {m.assignedCount} {m.assignedCount === 1 ? 'veículo' : 'veículos'}
                        </span>
                        {m.role === 'DRIVER' && (
                          <button
                            className="icon-button"
                            aria-label={`Remover ${m.name}`}
                            title={
                              m.assignedCount
                                ? 'Desvincule os veículos antes de remover'
                                : 'Remover da frota'
                            }
                            onClick={() => setDialog({ type: 'removeMember', member: m })}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="panel-footnote">
                    <ShieldCheck size={16} />
                    Motoristas veem apenas veículos atribuídos e podem atualizar a quilometragem.
                    Gestores cuidam de toda a frota.
                  </div>
                </section>
              )}
              {page === 'history' && canManage && (
                <section className="panel history-panel">
                  <SectionHeading title="Atividade do seu espaço" />
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
                  {notifications.length ? (
                    notifications.map((n) => (
                      <button
                        className={`notification-row ${!n.readAt ? 'unread' : ''}`}
                        key={n.id}
                        onClick={() => {
                          const v = vehicles.find((v) => v.id === n.vehicleId);
                          if (v) setSelectedVehicle(v);
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
                  <div className="panel-footnote">
                    <Mail size={16} />
                    Os e-mails deste ambiente ficam na{' '}
                    <a href="http://localhost:8025" target="_blank" rel="noreferrer">
                      caixa local
                    </a>
                    . Os avisos são avaliados automaticamente a cada 15 minutos.
                  </div>
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
        {nav.slice(0, 5).map((item) => (
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
          members={members}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
      {selectedVehicle && (
        <VehicleDetail
          vehicle={vehicles.find((v) => v.id === selectedVehicle.id) ?? selectedVehicle}
          org={orgId}
          canManage={canManage}
          fleet={fleet}
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

function AttentionCard({
  v,
  onSelect,
  onAction,
  canManage,
}: {
  v: Vehicle;
  onSelect: () => void;
  onAction: () => void;
  canManage: boolean;
}) {
  return (
    <article className={`attention-card ${v.status.level.toLowerCase()}`}>
      <div className="attention-top">
        <span className="car-icon">
          <CarFront size={20} />
        </span>
        <Status vehicle={v} />
      </div>
      <button className="plain vehicle-title" onClick={onSelect}>
        <strong>{v.name}</strong>
        <ArrowUpRight size={16} />
      </button>
      <span className="plate">{v.plate}</span>
      <p>
        {v.status.level === 'DUE'
          ? 'A troca de óleo precisa de atenção.'
          : v.status.trigger === 'TIME'
            ? `Troca em até ${v.status.daysRemaining} dias.`
            : `Faltam ${km(v.status.distanceRemainingKm)} km para a troca.`}
      </p>
      <div className="attention-bottom">
        <span>
          <Droplets size={14} />
          {OIL_LABELS[v.oilType]}
        </span>
        <button onClick={onAction}>
          {canManage ? 'Registrar troca' : 'Atualizar km'}
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}
function VehicleTable({
  vehicles,
  fleet,
  onSelect,
  onRead,
}: {
  vehicles: Vehicle[];
  fleet: boolean;
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
            {fleet && <th>Motorista</th>}
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
              {fleet && (
                <td>
                  <span className={`driver-cell ${!v.assignedDriverName ? 'unassigned' : ''}`}>
                    {v.assignedDriverName ? (
                      <>
                        <span className="avatar tiny">
                          {v.assignedDriverName
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                        {v.assignedDriverName.split(' ')[0]}
                      </>
                    ) : (
                      'Sem motorista'
                    )}
                  </span>
                </td>
              )}
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
  canManage,
  onAction,
  onSelect,
  events,
  onHistory,
  otherVehicles,
}: {
  vehicle: Vehicle;
  canManage: boolean;
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
            {canManage && (
              <button
                className="button subtle"
                onClick={() => onAction({ type: 'oil', vehicle: v })}
              >
                Já troquei o óleo
                <ArrowRight size={16} />
              </button>
            )}
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
            ) : e.action.includes('INVITATION') ? (
              <Mail size={18} />
            ) : e.action === 'DRIVER_ASSIGNED' ? (
              <UserRound size={18} />
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
