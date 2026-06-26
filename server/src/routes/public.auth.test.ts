// P1.2 — Authentication tests (POST /auth/login).
// Requires DATABASE_URL to be set (real Prisma connection).
// Skipped gracefully when no database is available.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startServer,
  stopServer,
  getBase,
  seedUser,
  deleteUser,
  prisma,
  TEST_IDS,
  HAS_DB,
} from '../test-helpers.js';

const OPERADOR_CPF = '11122233344';
const OPERADOR_EMAIL = 'operador-test@cme.local';
const OPERADOR_NOME = 'Test Operador Auth';
const OPERADOR_SENHA = 'test123';

beforeAll(async () => {
  if (!HAS_DB) return;
  await startServer();
  // Seed an operator with CPF + email for login tests
  await seedUser({
    id: TEST_IDS.OPERADOR,
    nome: OPERADOR_NOME,
    cpf: OPERADOR_CPF,
    email: OPERADOR_EMAIL,
    funcao: 'OPERADOR',
    senha: OPERADOR_SENHA,
  });
  // Seed an inactive user
  await seedUser({
    id: TEST_IDS.INACTIVE,
    nome: 'Inactive User',
    cpf: '99988877766',
    funcao: 'OPERADOR',
    senha: 'abc123',
    ativo: false,
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  await deleteUser(TEST_IDS.OPERADOR);
  await deleteUser(TEST_IDS.INACTIVE);
  await stopServer();
});

describe.skipIf(!HAS_DB)('POST /auth/login', () => {
  it('1. Login with formatted CPF → normalize + 200 + token', async () => {
    const res = await fetch(`${getBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '111.222.333-44', senha: OPERADOR_SENHA }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.user.cpf).toBe(OPERADOR_CPF);
  });

  it('2. Login with email → 200 + token', async () => {
    const res = await fetch(`${getBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: OPERADOR_EMAIL, senha: OPERADOR_SENHA }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
  });

  it('3. Login with name → 200 + token', async () => {
    const res = await fetch(`${getBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: OPERADOR_NOME, senha: OPERADOR_SENHA }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
  });

  it('4. Invalid credentials → 401', async () => {
    const res = await fetch(`${getBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: OPERADOR_CPF, senha: 'wrongpassword' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Credenciais inválidas');
  });

  it('5. Token payload has sub, nome, funcao', async () => {
    const res = await fetch(`${getBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: OPERADOR_CPF, senha: OPERADOR_SENHA }),
    });
    const body = await res.json();
    const token = body.token;

    // Decode JWT payload (middle segment)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.sub).toBe(TEST_IDS.OPERADOR);
    expect(payload.nome).toBe(OPERADOR_NOME);
    expect(payload.funcao).toBe('OPERADOR');
    // exp should exist and be roughly 12h from now
    expect(payload.exp).toBeDefined();
    const expDiffHours = (payload.exp - payload.iat) / 3600;
    expect(expDiffHours).toBeCloseTo(12, 0);
  });

  it('6. Inactive user → 401', async () => {
    const res = await fetch(`${getBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '99988877766', senha: 'abc123' }),
    });
    expect(res.status).toBe(401);
  });

  it('7. Missing identifier → 400', async () => {
    const res = await fetch(`${getBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '', senha: 'something' }),
    });
    expect(res.status).toBe(400);
  });
});
