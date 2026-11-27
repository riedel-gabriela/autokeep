import { useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { Session } from '../shared/domain.js';
import { api, write } from './api.js';
import { Brand } from './components.js';
import { ThemeToggle } from './ThemeToggle.js';

const googleErrors: Record<string, string> = {
  OAUTH_EMAIL: 'Use uma conta Google com e-mail verificado.',
  REGISTRATION_CONFLICT:
    'Este e-mail já está associado a uma conta. Entre com a conta Google vinculada a ela.',
};

type Providers = { google: boolean; development: boolean };

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [providers, setProviders] = useState<Providers | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    const code = new URLSearchParams(location.search).get('googleError');
    return code
      ? (googleErrors[code] ?? 'Não foi possível entrar com Google. Tente novamente.')
      : '';
  });

  useEffect(() => {
    const controller = new AbortController();
    void api<Providers>('/auth/providers', { signal: controller.signal })
      .then(setProviders)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    const url = new URL(location.href);
    if (url.searchParams.has('googleError')) {
      url.searchParams.delete('googleError');
      history.replaceState(history.state, '', url);
    }
    return () => controller.abort();
  }, []);

  async function enter() {
    setBusy(true);
    setError('');
    try {
      if (providers?.development) {
        onLogin(await write<Session>('/auth/dev-login', {}));
      } else {
        const { url } = await write<{ url: string }>('/auth/google/start', {});
        location.assign(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  return (
    <main className="login login-google-only">
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
          <h2>{providers?.development ? 'Sua garagem está pronta.' : 'Entre com Google.'}</h2>
          <p>
            {providers?.development
              ? 'Entre para acompanhar os cuidados com seu carro.'
              : 'Use sua conta Google para acessar seus veículos.'}
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {!providers && !error && (
            <div role="status">
              <LoaderCircle className="spin" size={18} /> Preparando acesso…
            </div>
          )}
          {providers && (providers.development || providers.google) && (
            <button
              className="button primary login-submit"
              type="button"
              disabled={busy}
              onClick={() => void enter()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  {providers.development ? 'Entrar' : 'Entrar com Google'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          )}
          {providers && !providers.google && !providers.development && (
            <div className="info-note" role="status">
              O acesso ainda não está configurado neste ambiente.
            </div>
          )}
          {providers?.google && !providers.development && (
            <div className="login-security-note">
              <ShieldCheck size={15} /> Acesso protegido pela sua conta Google
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
