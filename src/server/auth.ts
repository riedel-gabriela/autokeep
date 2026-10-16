import { createHash, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { parseCookie } from 'cookie';
import type { RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { pool, rows, transaction } from './db.js';
import { check } from './errors.js';
import { audit, type User } from './repository.js';

export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.',
  },
});
export const passwordSchema = z
  .string()
  .min(1)
  .max(72)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72);
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: passwordSchema,
  })
  .strict();
const dummyHash = hash(randomBytes(32).toString('base64url'), 12);
export function setCookie(res: Response, token: string) {
  res.cookie('autokeep_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.NODE_ENV === 'production' || config.APP_ORIGIN.startsWith('https://'),
    maxAge: 12 * 60 * 60_000,
    path: '/',
  });
}
export async function login(email: string, password: string) {
  const [user] = await rows<User>(pool, 'SELECT * FROM users WHERE email=?', [email]);
  // Execute bcrypt mesmo para usuários inexistentes, evitando um retorno imediato.
  const valid = await compare(password, user?.password_hash ?? (await dummyHash));
  check(user && valid, 401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  const token = randomBytes(32).toString('base64url');
  await transaction(async (db) => {
    await db.execute('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', [
      digest(token),
      user.id,
      new Date(Date.now() + 12 * 60 * 60_000),
    ]);
    await audit(db, null, user.id, 'LOGIN');
  });
  return { user, token };
}
export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const token = parseCookie(req.headers.cookie ?? '').autokeep_session;
    check(
      token && /^[A-Za-z0-9_-]{43}$/.test(token),
      401,
      'UNAUTHENTICATED',
      'Entre na sua conta para continuar.',
    );
    const [user] = await rows<User>(
      pool,
      'SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > UTC_TIMESTAMP(3)',
      [digest(token)],
    );
    check(user, 401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
    res.locals.user = user;
    res.locals.sessionHash = digest(token);
    next();
  } catch (error) {
    next(error);
  }
};
export const protectWrites: RequestHandler = (req, _res, next) => {
  try {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const expectedOrigin = new URL(config.APP_ORIGIN).origin;
      check(
        origin === expectedOrigin,
        403,
        'INVALID_ORIGIN',
        'Origem da solicitação não permitida.',
      );
      check(req.is('application/json'), 415, 'JSON_REQUIRED', 'Envie os dados no formato JSON.');
    }
    next();
  } catch (error) {
    next(error);
  }
};
