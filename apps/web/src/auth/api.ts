import type { Ecosystem, LinkedWallet } from '../execution/resolveExecution';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface Session { userId: string; wallets: LinkedWallet[]; }
interface Challenge { challengeId: string; message: string; expiresAt: string; }

export class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error?.code ?? 'api_error', result.error?.message ?? `API returned ${response.status}`);
  return result as T;
}

export async function getSession(): Promise<Session | null> {
  try { return await request<Session>('/me'); }
  catch (cause) { if (cause instanceof ApiError && cause.code === 'unauthenticated') return null; throw cause; }
}

export function requestChallenge(ecosystem: Ecosystem, address: string, purpose: 'login' | 'link-wallet') {
  return request<Challenge>(purpose === 'login' ? '/auth/challenge' : '/wallets/link/challenge', { ecosystem, address });
}

export function verifyChallenge(ecosystem: Ecosystem, address: string, signature: string, challengeId: string, purpose: 'login' | 'link-wallet') {
  return request(purpose === 'login' ? '/auth/verify' : '/wallets/link/verify', { ecosystem, address, signature, challengeId });
}

export function logout() { return request<{ ok: true }>('/logout', {}); }
