export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const unavailable =
  'A API da aplicação não está disponível neste endereço. O login precisa do servidor e do banco de dados publicados.';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new ApiError(0, 'API_UNAVAILABLE', unavailable);
  }
  if (response.status === 204) return undefined as T;
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(response.status, 'API_UNAVAILABLE', unavailable);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: unavailable }));
    throw new ApiError(
      response.status,
      error.code ?? 'REQUEST_FAILED',
      error.message ?? 'Não foi possível concluir a solicitação.',
    );
  }
  return response.json();
}
export const write = <T>(path: string, body: unknown, method = 'POST') =>
  api<T>(path, { method, body: JSON.stringify(body) });
