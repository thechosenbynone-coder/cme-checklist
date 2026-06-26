// Shared helpers for API integration tests.
// Starts the Express app on a random port and exposes utilities for
// authentication, seeding, and cleanup.
//
// DB-dependent tests are skipped when DATABASE_URL is not set (graceful
// degradation — `npm test` always passes even without a database).
import type { Server } from 'node:http';
import { app } from './app.js';
import { prisma } from './lib/prisma.js';
import { hashSenha, assinarToken, type Funcao } from './auth.js';

/** True when a real database is available for integration tests. */
export const HAS_DB = !!process.env.DATABASE_URL;

// ── Server lifecycle ─────────────────────────────────────────────────

let _server: Server | null = null;
let _base = '';

export async function startServer(): Promise<string> {
  if (_server) return _base;
  _server = app.listen(0);
  await new Promise<void>((r) => _server!.once('listening', () => r()));
  const addr = _server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  _base = `http://127.0.0.1:${port}`;
  return _base;
}

export function getBase(): string {
  return _base;
}

export async function stopServer(): Promise<void> {
  if (_server) {
    _server.close();
    _server = null;
  }
  await prisma.$disconnect();
}

// ── Seed helpers ─────────────────────────────────────────────────────

export interface SeedUserOpts {
  id: string;
  nome: string;
  cpf?: string;
  email?: string;
  funcao: Funcao;
  senha: string;
  ativo?: boolean;
}

export async function seedUser(opts: SeedUserOpts) {
  const senhaHash = await hashSenha(opts.senha);
  return prisma.user.upsert({
    where: { id: opts.id },
    update: {},
    create: {
      id: opts.id,
      nome: opts.nome,
      cpf: opts.cpf || null,
      email: opts.email || null,
      funcao: opts.funcao,
      senhaHash,
      ativo: opts.ativo ?? true,
    },
  });
}

export async function deleteUser(id: string) {
  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    // ignore if already deleted
  }
}

// ── Token helpers ────────────────────────────────────────────────────

export function tokenFor(userId: string, nome: string, funcao: Funcao): string {
  return assinarToken({ sub: userId, nome, funcao });
}

/** Convenience: make an authenticated fetch. */
export async function authFetch(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
}

// ── Constants for test user IDs (unique per suite to avoid collisions) ───

export const TEST_IDS = {
  ADMIN: 'usr-test-admin-001',
  GESTOR: 'usr-test-gestor-001',
  OPERADOR: 'usr-test-operador-001',
  SUPERVISOR: 'usr-test-supervisor-001',
  OPERADOR2: 'usr-test-operador-002',
  INACTIVE: 'usr-test-inactive-001',
} as const;

export { prisma };
