'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { action, str } from '../action';
import { clearSessionCookie, getCtx, SESSION_COOKIE, setSessionCookie } from '../auth';
import { fail } from '../core';
import { changePassword, login, logout, register, RegisterInput } from '../services/accounts';

export const loginAction = action(async (ctx, fd) => {
  const { token, user, maxAge } = await login(ctx, str(fd, 'loginId'), str(fd, 'password'));
  await setSessionCookie(token, maxAge);
  if (user.must_change_password) return { redirect: '/account?password=1' };
  const next = str(fd, 'next');
  return { redirect: user.role === 'admin' ? '/admin' : next.startsWith('/') && !next.startsWith('//') ? next : '/market' };
});

export const registerAction = action(async (ctx, fd) => {
  if (fd.get('agree') !== 'on') fail('利用規約・プライバシーポリシーへの同意が必要です');
  if (str(fd, 'password') !== str(fd, 'confirm')) fail('確認用パスワードが一致しません');
  const input = RegisterInput.parse({ name: str(fd, 'name'), kana: str(fd, 'kana'), loginId: str(fd, 'loginId'), password: str(fd, 'password') });
  await register(ctx, input);
  const { token, maxAge } = await login(ctx, input.loginId, input.password);
  await setSessionCookie(token, maxAge);
  return { redirect: '/account?welcome=1' };
});

export const changePasswordAction = action(async (ctx, fd) => {
  if (str(fd, 'password') !== str(fd, 'confirm')) fail('確認用パスワードが一致しません');
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  await changePassword(ctx, str(fd, 'current'), str(fd, 'password'), token);
  return 'パスワードを変更しました';
});

export async function logoutAction() {
  const ctx = await getCtx();
  const token = await clearSessionCookie();
  if (token) await logout(ctx, token);
  redirect('/login');
}
