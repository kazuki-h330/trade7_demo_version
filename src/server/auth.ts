import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { actorOf, type Ctx, type UserRow } from './core';
import { sha256 } from './crypto';
import { getDb } from './db';

export const SESSION_COOKIE = 't7_session';

export async function requestMeta() {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || '127.0.0.1';
  return { ip, ua: h.get('user-agent') ?? '' };
}

export const getCurrentUser = cache(async (): Promise<UserRow | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const { rows } = await db.query<UserRow>(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > now()', [sha256(token)]);
  const u = rows[0];
  return u && u.status !== 'expelled' ? u : null;
});

export async function getCtx(): Promise<Ctx> {
  const [u, meta] = await Promise.all([getCurrentUser(), requestMeta()]);
  return { actor: u ? actorOf(u) : null, ...meta };
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}
export async function requireMember() {
  const u = await requireUser();
  if (u.role === 'admin') redirect('/admin');
  return u;
}
export async function requireAdminUser() {
  const u = await requireUser();
  if (u.role !== 'admin') redirect('/market');
  return u;
}

export async function setSessionCookie(token: string, maxAge: number) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge,
    secure: process.env.NODE_ENV === 'production',
  });
}
export async function clearSessionCookie() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  return token;
}
