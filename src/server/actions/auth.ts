'use server';

import { redirect } from 'next/navigation';
import { action, str } from '../action';
import { clearSessionCookie, getCtx, setSessionCookie } from '../auth';
import { fail } from '../core';
import { login, logout, register, RegisterInput, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from '../services/accounts';

export const loginAction = action(async (ctx, fd) => {
  const { token, user, maxAge } = await login(ctx, str(fd, 'email'), str(fd, 'password'));
  await setSessionCookie(token, maxAge);
  const next = str(fd, 'next');
  return { redirect: user.role === 'admin' ? '/admin' : next.startsWith('/') && !next.startsWith('//') ? next : '/market' };
});

export const registerAction = action(async (ctx, fd) => {
  if (fd.get('agree') !== 'on') fail('利用規約・プライバシーポリシーへの同意が必要です');
  const input = RegisterInput.parse({ name: str(fd, 'name'), kana: str(fd, 'kana'), email: str(fd, 'email'), password: str(fd, 'password') });
  await register(ctx, input);
  const { token, maxAge } = await login(ctx, input.email, input.password);
  await setSessionCookie(token, maxAge);
  return { redirect: '/account?welcome=1' };
});

export const verifyEmailAction = action(async (ctx, fd) => {
  await verifyEmail(ctx, str(fd, 'code'));
  return 'メール認証が完了しました。続いて本人確認書類をご提出ください';
});

export const resendVerificationAction = action(async ctx => {
  await resendVerification(ctx);
  return '認証コードを再送しました';
});

export const requestResetAction = action(async (ctx, fd) => {
  await requestPasswordReset(ctx, str(fd, 'email'));
  return 'ご登録のメールアドレス宛に再設定のご案内を送信しました（登録がない場合は送信されません）';
});

export const resetPasswordAction = action(async (ctx, fd) => {
  if (str(fd, 'password') !== str(fd, 'confirm')) fail('確認用パスワードが一致しません');
  await resetPassword(ctx, str(fd, 'token'), str(fd, 'password'));
  return { redirect: '/login?reset=1' };
});

export async function logoutAction() {
  const ctx = await getCtx();
  const token = await clearSessionCookie();
  if (token) await logout(ctx, token);
  redirect('/login');
}
