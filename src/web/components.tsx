import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { ArrowUpRight, Check, ChevronRight, Gauge, LoaderCircle, X } from 'lucide-react';
import type { Vehicle } from '../shared/domain.js';

export const km = (n: number) => Math.max(0, Math.round(n)).toLocaleString('pt-BR');
export const date = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Date(value).toLocaleDateString(
    'pt-BR',
    options ?? { day: '2-digit', month: 'short', year: 'numeric' },
  );
export const todayInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const nowInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 19);
};
export const dayIso = (s: string) => new Date(`${s}T00:00:00`).toISOString();
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <a href="/" className={`brand ${light ? 'light' : ''}`} aria-label="AutoKeep, início">
      <img
        className="brand-wordmark"
        src="/autokeep-wordmark.png"
        width="174"
        height="58"
        alt="AutoKeep"
      />
    </a>
  );
}
export function CarArt({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={`car-art ${compact ? 'compact' : ''}`}
      viewBox="0 0 540 270"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="270" cy="226" rx="214" ry="14" fill="currentColor" opacity=".09" />
      <path
        d="M66 163l26-36 79-11 54-64c9-10 17-14 37-14h95c19 0 32 9 47 29l37 52 37 13c15 6 24 19 24 37v27H61v-19c0-6 2-10 5-14z"
        fill="currentColor"
      />
      <path
        d="M191 115l45-53c5-5 12-7 21-7h31v60h-97zm112-60h45c12 0 22 6 32 19l29 41H303V55z"
        fill="#eaf0e4"
      />
      <path d="M328 60h17c11 0 20 5 27 15l25 33h-69V60z" fill="#fff" opacity=".36" />
      <path
        d="M286 125v63m-111-62l-19 62m257-62l20 62"
        stroke="#eaf0e4"
        strokeOpacity=".25"
        strokeWidth="2"
      />
      <path d="M64 168h38l-8 14H61m391-37h36l8 15h-37l-7-15z" fill="#d7f0a2" />
      <rect x="308" y="130" width="26" height="5" rx="2.5" fill="#eaf0e4" opacity=".5" />
      <rect x="207" y="130" width="26" height="5" rx="2.5" fill="#eaf0e4" opacity=".5" />
      <path d="M64 196h434" stroke="#0b2a20" strokeWidth="8" strokeLinecap="round" />
      <circle cx="151" cy="194" r="38" fill="#193129" />
      <circle cx="151" cy="194" r="24" fill="#d5ded4" />
      <circle cx="151" cy="194" r="14" stroke="#52685c" strokeWidth="3" />
      <circle cx="151" cy="194" r="4" fill="#52685c" />
      <circle cx="413" cy="194" r="38" fill="#193129" />
      <circle cx="413" cy="194" r="24" fill="#d5ded4" />
      <circle cx="413" cy="194" r="14" stroke="#52685c" strokeWidth="3" />
      <circle cx="413" cy="194" r="4" fill="#52685c" />
      <path
        d="M83 104h60m-85 17h39m344-68h36m-18-18v36"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".3"
      />
    </svg>
  );
}
export function Status({ vehicle }: { vehicle: Vehicle }) {
  return (
    <span className={`status ${vehicle.status.level.toLowerCase()}`}>
      <i />
      {vehicle.status.level === 'OK'
        ? 'Em dia'
        : vehicle.status.level === 'WARNING'
          ? 'Atenção'
          : 'Troca vencida'}
    </span>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-header">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Form({
  onSubmit,
  children,
  label = 'Salvar',
  onCancel,
}: {
  onSubmit: (data: FormData) => Promise<void>;
  children: ReactNode;
  label?: string;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form">
      <fieldset disabled={busy}>{children}</fieldset>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <footer className="form-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{' '}
          {busy ? 'Salvando…' : label}
        </button>
      </footer>
    </form>
  );
}
export function Progress({ vehicle }: { vehicle: Vehicle }) {
  const limit =
    vehicle.oilType === 'MINERAL' ? 5000 : vehicle.oilType === 'SEMI_SYNTHETIC' ? 8000 : 12000;
  const percent = Math.min(
    100,
    Math.max(0, (1 - vehicle.status.distanceRemainingKm / limit) * 100),
  );
  return (
    <div
      className={`progress ${vehicle.status.level.toLowerCase()}`}
      role="progressbar"
      aria-label="Intervalo de óleo utilizado"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Gauge size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ChevronRight size={16} />
    </button>
  );
}
export function Stat({
  title,
  value,
  caption,
  icon,
  tone = '',
}: {
  title: string;
  value: ReactNode;
  caption: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <article className={`stat ${tone}`}>
      <div className="stat-label">
        {title}
        <span>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{caption}</p>
    </article>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="text-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={16} />
    </a>
  );
}
