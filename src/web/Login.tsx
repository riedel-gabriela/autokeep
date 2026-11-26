import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, ShieldCheck, Wrench } from 'lucide-react';
import type { Session } from '../shared/domain.js';
import { api, write } from './api.js';
import { Brand, CarArt } from './components.js';
import { localDevelopment as local } from './environment.js';
import { ThemeToggle } from './ThemeToggle.js';

const googleErrors: Record<string, string> = {
  INVITATION_INVALID: 'Confira a validade do convite e use a conta Google do e-mail convidado.',
  OAUTH_LINK: 'Use a conta Google com o mesmo e-mail da sua conta AutoKeep.',
  OAUTH_EMAIL: 'Use uma conta Google com e-mail verificado.',
  REGISTRATION_CONFLICT:
    'Este e-mail já está associado a uma conta. Entre com a conta Google vinculada a ela.',
};

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
    [googleEnabled, setGoogleEnabled] = useState(false),
    [passwordLoginEnabled, setPasswordLoginEnabled] = useState(local),
    [providerConfigurationLoaded, setProviderConfigurationLoaded] = useState(false),
    [demoCredentialsAvailable, setDemoCredentialsAvailable] = useState(false),
    [error, setError] = useState(() => {
      const code = new URLSearchParams(location.search).get('googleError');
      return code
        ? Object.hasOwn(googleErrors, code)
          ? googleErrors[code]
          : 'Não foi possível entrar com Google. Tente novamente.'
        : '';
    });
  const [register, setRegister] = useState(Boolean(invitation)),
    [registered, setRegistered] = useState(false);
  const [signup, setSignup] = useState(false);
  const [workspaceKind, setWorkspaceKind] = useState<'PERSONAL' | 'FLEET'>('PERSONAL');
  const [workspaceName, setWorkspaceName] = useState('');
  const googleOnly =
    !local || (providerConfigurationLoaded && googleEnabled && !passwordLoginEnabled);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ google: boolean; password: boolean }>('/auth/providers', {
      signal: controller.signal,
    })
      .then(({ google, password }) => {
        setGoogleEnabled(google);
        setPasswordLoginEnabled(password);
      })
      .catch(() => {})
      .finally(() => setProviderConfigurationLoaded(true));
    void api<{ email: string; password: string }>('/auth/demo-credentials', {
      signal: controller.signal,
    })
      .then(({ email: demoEmail, password: demoPassword }) => {
        setEmail(demoEmail);
        setPassword(demoPassword);
        setDemoCredentialsAvailable(true);
      })
      .catch(() => {});
    const url = new URL(location.href);
    if (url.searchParams.has('googleError')) {
      url.searchParams.delete('googleError');
      history.replaceState(history.state, '', url);
    }
    return () => controller.abort();
  }, []);

  async function startGoogle(link = false) {
    setBusy(true);
    setError('');
    try {
      const { url } = await write<{ url: string }>('/auth/google/start', {
        ...(invitation ? { invitation } : {}),
        ...(link ? { credentials: { email, password } } : {}),
        ...(signup ? { workspace: { kind: workspaceKind, name: workspaceName } } : {}),
      });
      location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar o login com Google.');
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'link-google') {
      await startGoogle(true);
      return;
    }
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
            <Wrench size={15} /> MANUTENÇÃO SOB CONTROLE
          </span>
          <h1>
            Seu carro em dia.
            <br />
            Você no comando.
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
        <footer>Mais controle na garagem. Mais confiança na estrada.</footer>
      </section>
      <section className="login-form-panel">
        <ThemeToggle />
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="login-form-inner">
          <span className="login-icon">
            <ShieldCheck size={25} />
          </span>
          <span className="eyebrow">BEM-VINDO AO AUTOKEEP</span>
          <h2>
            {signup
              ? 'Crie seu espaço'
              : register
                ? 'Você está convidado.'
                : local
                  ? 'Bom te ver por aqui.'
                  : 'Entre com Google.'}
          </h2>
          <p>
            {signup
              ? 'Escolha como você quer usar o AutoKeep.'
              : register
                ? 'Crie sua conta para acompanhar os veículos da frota.'
                : local
                  ? 'Entre para acompanhar o que move o seu dia.'
                  : 'Use sua conta Google para acessar seus veículos e sua frota.'}
          </p>
          {registered && (
            <div className="success-note">
              Conta criada! Entre com o e-mail do convite e sua nova senha.
            </div>
          )}
          {!googleOnly && invitation && (
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
          {googleOnly ? (
            <>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              {googleEnabled ? (
                <button
                  className="button primary login-submit"
                  type="button"
                  disabled={busy}
                  onClick={() => void startGoogle()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <>
                      {invitation ? 'Aceitar convite com Google' : 'Entrar com Google'}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              ) : (
                <div className="info-note" role="status">
                  O login Google ainda não está configurado neste ambiente.
                </div>
              )}
            </>
          ) : signup ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void startGoogle();
              }}
            >
              <label>
                Tipo de espaço
                <select
                  value={workspaceKind}
                  onChange={(event) =>
                    setWorkspaceKind(event.target.value === 'FLEET' ? 'FLEET' : 'PERSONAL')
                  }
                >
                  <option value="PERSONAL">Meu carro</option>
                  <option value="FLEET">Gestão de frota</option>
                </select>
              </label>
              <label>
                {workspaceKind === 'FLEET' ? 'Nome da frota' : 'Nome da garagem'}
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary login-submit" disabled={busy}>
                Criar conta com Google
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setSignup(false);
                  setError('');
                }}
              >
                Voltar para o login
              </button>
            </form>
          ) : passwordLoginEnabled || (googleEnabled && !register) ? (
            <form onSubmit={submit}>
              {!passwordLoginEnabled && (
                <div className="info-note">
                  Use estes dados apenas para vincular uma conta existente. A entrada será feita
                  pelo Google.
                </div>
              )}
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
              {passwordLoginEnabled && (
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
              )}
              {googleEnabled && !register && (
                <button
                  className="button secondary"
                  type="submit"
                  value="link-google"
                  disabled={busy}
                >
                  Vincular Google com e-mail e senha
                </button>
              )}
            </form>
          ) : (
            <div className="info-note" role="status">
              {googleEnabled
                ? 'A autenticação desta aplicação usa sua conta Google.'
                : 'O login Google ainda não está configurado neste ambiente.'}
            </div>
          )}
          {!googleOnly && googleEnabled && !signup && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => void startGoogle()}
            >
              {register ? 'Aceitar convite com Google' : 'Entrar com Google'}
            </button>
          )}
          {!googleOnly && googleEnabled && !invitation && !signup && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setSignup(true);
                setError('');
              }}
            >
              Criar uma conta
            </button>
          )}
          {passwordLoginEnabled && !register && !signup && (
            <div className="demo-accounts">
              <span className="eyebrow">EXPLORE OS PERFIS DE DEMONSTRAÇÃO</span>
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
              {demoCredentialsAvailable ? (
                <p>Senha local de demonstração preenchida automaticamente.</p>
              ) : local ? (
                <p>
                  A senha local também aparece no terminal com <code>npm run credentials</code>.
                </p>
              ) : (
                <p>
                  A senha de demonstração está no terminal com{' '}
                  <code>npm run credentials -- --cloud</code>.
                </p>
              )}
            </div>
          )}
          {!googleOnly && (
            <div className="login-footnote">
              <ShieldCheck size={14} />
              {local ? 'Ambiente local de desenvolvimento' : 'Ambiente de desenvolvimento'}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
