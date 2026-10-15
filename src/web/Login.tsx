import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import type { Session } from '../shared/domain.js';
import { write } from './api.js';
import { Brand, CarArt } from './components.js';

export function Login({
  onLogin,
  invitation,
  onInvitationConsumed,
}: {
  onLogin: (session: Session) => void;
  invitation: string | null;
  onInvitationConsumed: () => void;
}) {
  const [email, setEmail] = useState('ana@autokeep.local'),
    [password, setPassword] = useState(''),
    [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [register, setRegister] = useState(Boolean(invitation)),
    [registered, setRegistered] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (register) {
        await write('/auth/register-invited', { token: invitation, name, password });
        setRegister(false);
        setRegistered(true);
        setPassword('');
        onInvitationConsumed();
      } else {
        const session = await write<Session>('/auth/login', { email, password });
        onLogin(session);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <Brand />
        <div className="login-story-content">
          <span className="eyebrow">
            <Sparkles size={15} /> MENOS PREOCUPAÇÃO, MAIS CAMINHO
          </span>
          <h1>
            Cuidar do carro.
            <br />
            Seguir tranquilo.
          </h1>
          <p>Da sua garagem à sua frota, a próxima manutenção está sempre no radar.</p>
          <CarArt />
          <div className="story-features">
            <span>
              <Check size={16} /> Trocas no momento certo
            </span>
            <span>
              <Check size={16} /> Histórico sempre à mão
            </span>
            <span>
              <Check size={16} /> Sua frota sob controle
            </span>
          </div>
        </div>
        <footer>Seu próximo destino começa com cuidado.</footer>
      </section>
      <section className="login-form-panel">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="login-form-inner">
          <span className="login-icon">
            <ShieldCheck size={25} />
          </span>
          <span className="eyebrow">BEM-VINDO AO AUTOKEEP</span>
          <h2>{register ? 'Você está convidado.' : 'Bom te ver por aqui.'}</h2>
          <p>
            {register
              ? 'Crie sua conta para acompanhar os veículos da frota.'
              : 'Entre para acompanhar o que move o seu dia.'}
          </p>
          {registered && (
            <div className="success-note">
              Conta criada! Entre com o e-mail do convite e sua nova senha.
            </div>
          )}
          {invitation && (
            <div className="info-note">
              {register ? 'Já tem uma conta?' : 'Recebeu um convite?'}{' '}
              <button
                type="button"
                className="inline-link"
                onClick={() => {
                  setRegister(!register);
                  setError('');
                }}
              >
                {register ? 'Entrar para aceitar' : 'Criar uma conta'}
              </button>
            </div>
          )}
          <form onSubmit={submit}>
            {register ? (
              <label>
                Seu nome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={100}
                  required
                  autoComplete="name"
                  placeholder="Como podemos te chamar?"
                />
              </label>
            ) : (
              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                  maxLength={254}
                />
              </label>
            )}
            <label>
              Senha
              <div className="password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  minLength={register ? 12 : 1}
                  maxLength={72}
                  placeholder={register ? 'Pelo menos 12 caracteres' : 'Sua senha de acesso'}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary login-submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  {register ? 'Criar minha conta' : 'Entrar na minha conta'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          {!register && (
            <div className="demo-accounts">
              <span className="eyebrow">EXPLORE OS PERFIS LOCAIS</span>
              <div>
                {[
                  ['ana@autokeep.local', 'Meu carro'],
                  ['marina@autokeep.local', 'Gestão de frota'],
                  ['lucas@autokeep.local', 'Motorista'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={email === value ? 'selected' : ''}
                    onClick={() => setEmail(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p>
                A senha local está disponível no terminal com <code>npm run credentials</code>.
              </p>
            </div>
          )}
          <div className="login-footnote">
            <ShieldCheck size={14} /> Ambiente local de desenvolvimento
          </div>
        </div>
      </section>
    </main>
  );
}
