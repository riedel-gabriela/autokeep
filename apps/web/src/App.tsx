import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "react-oidc-context";
import type { OilType, Vehicle } from "@autokeep/domain";
import { ApiClient, type Member, type Organization } from "./api.js";
import type { RuntimeConfig } from "./config.js";
import { readObdDistance } from "./obd.js";

const oilLabels: Record<OilType, string> = {
  MINERAL: "Mineral · 5.000 km",
  SEMI_SYNTHETIC: "Semissintético · 8.000 km",
  FULL_SYNTHETIC: "Sintético · 12.000 km",
};

function formatKm(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

function Login({ onLogin }: { onLogin: () => void }) {
  return <main className="login-shell">
    <section className="login-copy">
      <div className="brand"><span className="brand-mark">A</span> AutoKeep</div>
      <p className="eyebrow">MANUTENÇÃO SEM SURPRESAS</p>
      <h1>Seu carro avisa.<br /><em>Você chega antes.</em></h1>
      <p className="lead">Acompanhe distância e tempo em um só lugar. O AutoKeep aprende sua rotina e avisa a hora certa da próxima troca.</p>
      <button className="primary large" onClick={onLogin}>Entrar com segurança <span>→</span></button>
      <div className="login-proof"><span>✓ Login protegido</span><span>✓ Dados isolados</span><span>✓ Sem senha no app</span></div>
    </section>
    <aside className="preview-card">
      <div className="preview-top"><span>STATUS DO VEÍCULO</span><span className="live-dot">AO VIVO</span></div>
      <div className="car-orbit"><div className="orbit one" /><div className="orbit two" /><span>AK</span></div>
      <h2>Faltam 1.240 km</h2><p>ou 47 dias para a próxima troca</p>
      <div className="meter"><i /></div>
      <div className="preview-stats"><div><b>8.760</b><span>km desde a troca</span></div><div><b>38,4</b><span>km por dia</span></div></div>
    </aside>
  </main>;
}

function NewOrganization({ api, onCreated }: { api: ApiClient; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await api.createOrganization(name); await onCreated(); } finally { setBusy(false); }
  }
  return <main className="empty-state"><div className="brand"><span className="brand-mark">A</span> AutoKeep</div><section>
    <p className="eyebrow">PRIMEIROS PASSOS</p><h1>Como vamos chamar sua garagem?</h1>
    <p>Ela pode ser pessoal ou representar uma empresa e sua frota.</p>
    <form onSubmit={submit}><label>Nome da garagem<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Garagem da Gabi" /></label><button className="primary" disabled={busy}>{busy ? "Criando…" : "Criar garagem"}</button></form>
  </section></main>;
}

function VehicleCard({ vehicle, organizationId, api, reload, canManage, drivers }: { vehicle: Vehicle; organizationId: string; api: ApiClient; reload: () => void; canManage: boolean; drivers: Member[] }) {
  const [odometer, setOdometer] = useState(String(vehicle.currentOdometer));
  const [message, setMessage] = useState("");
  const level = vehicle.status?.level ?? "OK";
  async function update(source: "MANUAL" | "OBD2") {
    setMessage("");
    try { await api.updateOdometer(organizationId, vehicle.id, Number(odometer), source); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar"); }
  }
  async function obd() {
    setMessage("Conectando ao adaptador…");
    try { const reading = await readObdDistance(); setMessage(`${reading.distanceSinceCodesClearedKm} km desde a limpeza de falhas. ${reading.warning}`); } catch (error) { setMessage(error instanceof Error ? error.message : "Leitura indisponível"); }
  }
  async function archive() {
    if (!window.confirm(`Arquivar ${vehicle.name}? O histórico será preservado.`)) return;
    await api.archiveVehicle(organizationId, vehicle.id); reload();
  }
  return <article className={`vehicle-card ${level.toLowerCase()}`}>
    <header><div><span className="vehicle-icon">◆</span><div><h3>{vehicle.name}</h3><p>{vehicle.trackingMode === "OBD2" ? "OBD2 + confirmação" : "Estimativa preditiva"}</p></div></div><span className="status-pill">{level === "DUE" ? "Troca necessária" : level === "WARNING" ? "Atenção" : "Tudo certo"}</span></header>
    <div className="vehicle-km"><strong>{formatKm(vehicle.currentOdometer)}</strong><span>km atuais</span></div>
    <div className="clock-grid"><div><span>RELÓGIO DE DISTÂNCIA</span><b>{formatKm(Math.max(0, vehicle.status?.distanceRemainingKm ?? 0))} km</b><small>restantes</small></div><div><span>RELÓGIO DE TEMPO</span><b>{Math.max(0, vehicle.status?.daysRemaining ?? 0)} dias</b><small>restantes</small></div></div>
    <div className="vehicle-meta"><span>{oilLabels[vehicle.oilType]}</span><span>Média {formatKm(vehicle.avgDailyKm)} km/dia</span></div>
    <div className="quick-update"><input aria-label="Novo odômetro" inputMode="decimal" value={odometer} onChange={(e) => setOdometer(e.target.value)} /><button onClick={() => void update("MANUAL")}>Atualizar km</button>{vehicle.trackingMode === "OBD2" && <button className="ghost" onClick={() => void obd()}>Conectar OBD2</button>}</div>
    {canManage && drivers.length > 0 && <label className="driver-select">Motorista responsável<select value={vehicle.assignedDriverId ?? ""} onChange={(event) => void api.assignDriver(organizationId, vehicle.id, event.target.value || null).then(reload)}><option value="">Sem motorista</option>{drivers.map((driver) => <option key={driver.userId} value={driver.userId}>{driver.email}</option>)}</select></label>}
    {canManage && <div className="card-actions"><button className="text-button" onClick={() => void api.registerOilChange(organizationId, vehicle.id, Number(odometer), vehicle.oilType).then(reload)}>Registrar troca agora</button><button className="text-button danger" onClick={() => void archive()}>Arquivar veículo</button></div>}
    {message && <p className="inline-message">{message}</p>}
  </article>;
}

function AddVehicle({ api, organizationId, onDone }: { api: ApiClient; organizationId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentOdometer = Number(data.get("currentOdometer"));
    await api.createVehicle(organizationId, {
      name: data.get("name"), trackingMode: data.get("trackingMode"), oilType: data.get("oilType"),
      currentOdometer, lastOilChangeKm: Number(data.get("lastOilChangeKm")),
      lastOilChangeDate: new Date(String(data.get("lastOilChangeDate"))).toISOString(),
    });
    setOpen(false); onDone();
  }
  return <>{<button className="primary" onClick={() => setOpen(true)}>+ Adicionar veículo</button>}{open && <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><section className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setOpen(false)}>×</button><p className="eyebrow">NOVO VEÍCULO</p><h2>Comece pelo ponto zero</h2><form onSubmit={(e) => void submit(e)} className="form-grid">
    <label className="wide">Nome do veículo<input name="name" required maxLength={100} placeholder="Honda Civic 2022" /></label>
    <label>Modo<select name="trackingMode" defaultValue="MANUAL"><option value="MANUAL">Manual preditivo</option><option value="OBD2">OBD2</option></select></label>
    <label>Tipo de óleo<select name="oilType" defaultValue="FULL_SYNTHETIC"><option value="MINERAL">Mineral</option><option value="SEMI_SYNTHETIC">Semissintético</option><option value="FULL_SYNTHETIC">Sintético</option></select></label>
    <label>Odômetro atual<input name="currentOdometer" required type="number" min="0" max="9999999.9" step="0.1" /></label>
    <label>Km da última troca<input name="lastOilChangeKm" required type="number" min="0" max="9999999.9" step="0.1" /></label>
    <label className="wide">Data da última troca<input name="lastOilChangeDate" required type="datetime-local" /></label>
    <button className="primary wide">Salvar veículo</button>
  </form></section></div>}</>;
}

export function App({ config }: { config: RuntimeConfig }) {
  const auth = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeId, setActiveId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const api = useMemo(() => new ApiClient(config.apiBaseUrl, () => auth.user?.id_token), [auth.user?.id_token, config.apiBaseUrl]);

  const loadOrganizations = useCallback(async () => {
    const result = await api.organizations();
    setOrganizations(result.organizations);
    setActiveId((current) => current || result.organizations[0]?.organizationId || "");
    setLoading(false);
  }, [api]);
  const loadDashboard = useCallback(async () => {
    if (!activeId) return;
    const organization = organizations.find((item) => item.organizationId === activeId);
    const [dashboard, memberResult] = await Promise.all([
      api.dashboard(activeId),
      organization?.role === "ADMIN" ? api.members(activeId) : Promise.resolve({ members: [] }),
    ]);
    setVehicles(dashboard.vehicles); setMembers(memberResult.members);
  }, [activeId, api, organizations]);

  useEffect(() => {
    const invite = window.location.hash.match(/invite=([^&]+)/)?.[1];
    if (invite) sessionStorage.setItem("autokeep-invite", decodeURIComponent(invite));
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated) { setLoading(false); return; }
    void loadOrganizations().catch(() => { setError("Não foi possível carregar suas garagens."); setLoading(false); });
  }, [auth.isAuthenticated, loadOrganizations]);

  useEffect(() => { void loadDashboard().catch(() => setError("Não foi possível carregar os veículos.")); }, [loadDashboard]);

  useEffect(() => {
    const token = sessionStorage.getItem("autokeep-invite");
    if (!auth.isAuthenticated || !token) return;
    void api.acceptInvitation(token).then(() => { sessionStorage.removeItem("autokeep-invite"); return loadOrganizations(); }).catch(() => setError("Este convite não é válido para a conta atual."));
  }, [api, auth.isAuthenticated, loadOrganizations]);

  if (auth.isLoading || loading) return <main className="loading"><div className="brand-mark pulse">A</div><p>Preparando sua garagem…</p></main>;
  if (!auth.isAuthenticated) return <Login onLogin={() => void auth.signinRedirect()} />;
  if (organizations.length === 0) return <NewOrganization api={api} onCreated={loadOrganizations} />;

  const active = organizations.find((item) => item.organizationId === activeId) ?? organizations[0]!;
  const due = vehicles.filter((item) => item.status?.level === "DUE").length;
  const warning = vehicles.filter((item) => item.status?.level === "WARNING").length;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">A</span> AutoKeep</div><nav><a className="active" href="#dashboard">▦ <span>Visão geral</span></a><a href="#vehicles">◇ <span>Veículos</span></a><a href="#alerts">◌ <span>Alertas</span></a><a href="/openapi.yaml">⌘ <span>API</span></a></nav><div className="sidebar-foot"><span className="avatar">{auth.user?.profile.email?.slice(0, 1).toUpperCase()}</span><div><b>{auth.user?.profile.name ?? "Minha conta"}</b><small>{active.role === "ADMIN" ? "Gestor" : "Motorista"}</small></div><button aria-label="Sair" onClick={() => void auth.signoutRedirect()}>↗</button></div></aside>
    <main className="dashboard" id="dashboard"><header className="topbar"><div><p className="eyebrow">PAINEL DA GARAGEM</p><h1>{active.companyName}</h1></div><div className="top-actions"><select aria-label="Organização" value={activeId} onChange={(e) => setActiveId(e.target.value)}>{organizations.map((organization) => <option key={organization.organizationId} value={organization.organizationId}>{organization.companyName}</option>)}</select>{active.role === "ADMIN" && <AddVehicle api={api} organizationId={active.organizationId} onDone={loadDashboard} />}</div></header>
    {error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}
    <section className="summary"><article><span>VEÍCULOS</span><b>{vehicles.length}</b><small>na garagem</small></article><article className={due ? "urgent" : ""}><span>TROCA NECESSÁRIA</span><b>{due}</b><small>exigem ação</small></article><article className={warning ? "attention" : ""}><span>PRÓXIMOS DO LIMITE</span><b>{warning}</b><small>em pré-aviso</small></article><article><span>COBERTURA</span><b>{vehicles.length ? "100%" : "—"}</b><small>monitorados</small></article></section>
    <section className="section-heading" id="vehicles"><div><p className="eyebrow">DUPLO RELÓGIO</p><h2>Seus veículos</h2></div><p>O primeiro limite atingido — distância ou tempo — dispara o alerta.</p></section>
    <section className="vehicle-grid">{vehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} organizationId={active.organizationId} api={api} reload={loadDashboard} canManage={active.role === "ADMIN"} drivers={members.filter((member) => member.role === "DRIVER")} />)}{vehicles.length === 0 && <div className="no-vehicles"><span>◇</span><h3>Sua garagem está vazia</h3><p>Adicione o primeiro veículo para iniciar o monitoramento.</p></div>}</section>
    {active.role === "ADMIN" && <InvitePanel api={api} organizationId={active.organizationId} members={members} reload={loadDashboard} />}
    </main>
  </div>;
}

function InvitePanel({ api, organizationId, members, reload }: { api: ApiClient; organizationId: string; members: Member[]; reload: () => void }) {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); await api.inviteDriver(organizationId, email); setEmail(""); setMessage("Convite enviado. Ele será válido por 7 dias."); }
  async function remove(member: Member) {
    if (!window.confirm(`Remover ${member.email}? Desatribua seus veículos antes.`)) return;
    await api.removeMember(organizationId, member.userId); reload();
  }
  const drivers = members.filter((member) => member.role === "DRIVER");
  return <section className="invite-panel"><div><p className="eyebrow">EQUIPE</p><h2>Convide um motorista</h2><p>Motoristas enxergam apenas os veículos atribuídos e podem confirmar o odômetro.</p>{drivers.length > 0 && <ul className="member-list">{drivers.map((driver) => <li key={driver.userId}><span>{driver.email}</span><button onClick={() => void remove(driver)}>Remover</button></li>)}</ul>}</div><form onSubmit={(e) => void submit(e)}><input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="motorista@empresa.com" /><button className="secondary">Enviar convite</button>{message && <small>{message}</small>}</form></section>;
}
