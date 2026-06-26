// P1.3 — Admin / User CRUD tests.
// Requires DATABASE_URL (real Prisma connection).
// Skipped gracefully when no database is available.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startServer,
  stopServer,
  getBase,
  seedUser,
  deleteUser,
  tokenFor,
  authFetch,
  prisma,
  TEST_IDS,
  HAS_DB,
} from '../test-helpers.js';

// Unique IDs for users created by these tests (avoid collisions with other suites)
const ADMIN_ID = 'usr-admin-test-crud';
const GESTOR_ID = 'usr-gestor-test-crud';
const OPERADOR_ID = 'usr-operador-test-crud';

const CREATED_IDS: string[] = [];

let adminToken: string;
let gestorToken: string;
let operadorToken: string;

beforeAll(async () => {
  if (!HAS_DB) return;
  await startServer();

  await seedUser({ id: ADMIN_ID, nome: 'Admin CRUD', cpf: '00100200304', funcao: 'ADMIN', senha: 'adm123' });
  await seedUser({ id: GESTOR_ID, nome: 'Gestor CRUD', cpf: '00500600708', funcao: 'GESTOR', senha: 'ges123' });
  await seedUser({ id: OPERADOR_ID, nome: 'Operador CRUD', cpf: '00900100112', funcao: 'OPERADOR', senha: 'op1234' });

  adminToken = tokenFor(ADMIN_ID, 'Admin CRUD', 'ADMIN');
  gestorToken = tokenFor(GESTOR_ID, 'Gestor CRUD', 'GESTOR');
  operadorToken = tokenFor(OPERADOR_ID, 'Operador CRUD', 'OPERADOR');
});

afterAll(async () => {
  if (!HAS_DB) return;
  // Clean up created users
  for (const id of CREATED_IDS) {
    await deleteUser(id);
  }
  await deleteUser(ADMIN_ID);
  await deleteUser(GESTOR_ID);
  await deleteUser(OPERADOR_ID);
  await stopServer();
});

describe.skipIf(!HAS_DB)('POST /api/users (create)', () => {
  it('1. ADMIN creates OPERADOR → 201', async () => {
    const res = await authFetch(`${getBase()}/api/users`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Novo Operador',
        cpf: '22233344455',
        funcao: 'OPERADOR',
        senha: 'op123',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.funcao).toBe('OPERADOR');
    CREATED_IDS.push(body.id);
  });

  it('2. ADMIN creates SUPERVISOR → 201', async () => {
    const res = await authFetch(`${getBase()}/api/users`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Novo Supervisor',
        email: 'supervisor-test@cme.local',
        funcao: 'SUPERVISOR',
        senha: 'sup123',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.funcao).toBe('SUPERVISOR');
    CREATED_IDS.push(body.id);
  });

  it('3. ADMIN creates another ADMIN → 201', async () => {
    const res = await authFetch(`${getBase()}/api/users`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Segundo Admin',
        email: 'admin2-test@cme.local',
        funcao: 'ADMIN',
        senha: 'adm456',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.funcao).toBe('ADMIN');
    CREATED_IDS.push(body.id);
  });

  it('4. GESTOR creates OPERADOR → 201', async () => {
    const res = await authFetch(`${getBase()}/api/users`, gestorToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Operador do Gestor',
        cpf: '55566677788',
        funcao: 'OPERADOR',
        senha: 'opg123',
      }),
    });
    expect(res.status).toBe(201);
    CREATED_IDS.push((await res.json()).id);
  });

  it('5. GESTOR creates SUPERVISOR → 201', async () => {
    const res = await authFetch(`${getBase()}/api/users`, gestorToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Supervisor do Gestor',
        email: 'supg-test@cme.local',
        funcao: 'SUPERVISOR',
        senha: 'supg12',
      }),
    });
    expect(res.status).toBe(201);
    CREATED_IDS.push((await res.json()).id);
  });

  it('6. GESTOR tries to create ADMIN → 403', async () => {
    const res = await authFetch(`${getBase()}/api/users`, gestorToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Admin Proibido',
        email: 'nope-test@cme.local',
        funcao: 'ADMIN',
        senha: 'nop123',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('7. Duplicate CPF → 409', async () => {
    const res = await authFetch(`${getBase()}/api/users`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Duplicado',
        cpf: '22233344455', // same as test 1
        funcao: 'OPERADOR',
        senha: 'dup123',
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('Já existe');
  });

  it('8. No CPF and no email → 400 (Zod validation)', async () => {
    const res = await authFetch(`${getBase()}/api/users`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Sem Identificador',
        funcao: 'OPERADOR',
        senha: 'sem123',
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!HAS_DB)('PATCH /api/users/:id (update)', () => {
  it('9. Deactivate last ADMIN → 409', async () => {
    // First, ensure only 1 ADMIN by checking. Our seed has ADMIN_ID + "Segundo Admin" from test 3.
    // Remove the second admin first to make ADMIN_ID the last.
    const secondAdminId = CREATED_IDS[2]; // "Segundo Admin" from test 3
    if (secondAdminId) {
      await prisma.user.update({ where: { id: secondAdminId }, data: { funcao: 'OPERADOR' } });
    }

    const res = await authFetch(`${getBase()}/api/users/${ADMIN_ID}`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: false }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('último');

    // Restore second admin
    if (secondAdminId) {
      await prisma.user.update({ where: { id: secondAdminId }, data: { funcao: 'ADMIN' } });
    }
  });
});

describe.skipIf(!HAS_DB)('POST /api/users/:id/reset-password', () => {
  it('10. OPERADOR tries to reset another user password → 403', async () => {
    const res = await authFetch(`${getBase()}/api/users/${GESTOR_ID}/reset-password`, operadorToken, {
      method: 'POST',
      body: JSON.stringify({ novaSenha: 'hacked' }),
    });
    expect(res.status).toBe(403);
  });

  it('11. User resets own password → 200', async () => {
    const res = await authFetch(`${getBase()}/api/users/${OPERADOR_ID}/reset-password`, operadorToken, {
      method: 'POST',
      body: JSON.stringify({ novaSenha: 'newpw1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe.skipIf(!HAS_DB)('GET /api/users (pagination)', () => {
  it('returns paginated envelope with correct structure', async () => {
    const res = await authFetch(`${getBase()}/api/users?page=1&limit=5`, adminToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(5);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
  });
});
