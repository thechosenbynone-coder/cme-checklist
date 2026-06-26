// P1.5 — Audit trail tests.
// Verifies that CRUD operations create AuditLog entries and that the
// GET /api/auditoria endpoint returns paginated, filterable results.
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
  HAS_DB,
} from '../test-helpers.js';

const ADMIN_ID = 'usr-admin-audit-test';
const CREATED_USER_ID = 'usr-audit-created-op';
let adminToken: string;
const CREATED_IDS: string[] = [];

beforeAll(async () => {
  if (!HAS_DB) return;
  await startServer();
  await seedUser({ id: ADMIN_ID, nome: 'Admin Auditoria', cpf: '88800100109', funcao: 'ADMIN', senha: 'adm123' });
  adminToken = tokenFor(ADMIN_ID, 'Admin Auditoria', 'ADMIN');
});

afterAll(async () => {
  if (!HAS_DB) return;
  // Clean created users
  for (const id of CREATED_IDS) {
    await deleteUser(id);
  }
  // Clean audit logs created by this test
  await prisma.auditLog.deleteMany({ where: { userId: ADMIN_ID } });
  await deleteUser(ADMIN_ID);
  await stopServer();
});

describe.skipIf(!HAS_DB)('AuditLog side effects', () => {
  it('1. POST /api/users creates AuditLog with acao=CRIAR_USUARIO', async () => {
    const res = await authFetch(`${getBase()}/api/users`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Audit Op',
        cpf: '88811122233',
        funcao: 'OPERADOR',
        senha: 'aud123',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    CREATED_IDS.push(body.id);

    // Check audit log
    const log = await prisma.auditLog.findFirst({
      where: { acao: 'CRIAR_USUARIO', entidadeId: body.id },
      orderBy: { criadoEm: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log!.userId).toBe(ADMIN_ID);
    expect(log!.entidade).toBe('USER');
  });

  it('2. POST /api/users/:id/reset-password creates AuditLog with acao=RESET_SENHA', async () => {
    const targetId = CREATED_IDS[0]!;
    const res = await authFetch(`${getBase()}/api/users/${targetId}/reset-password`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ novaSenha: 'new123' }),
    });
    expect(res.status).toBe(200);

    const log = await prisma.auditLog.findFirst({
      where: { acao: 'RESET_SENHA', entidadeId: targetId },
      orderBy: { criadoEm: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log!.userId).toBe(ADMIN_ID);
  });

  it('3. AuditLog row contains required fields and no password/hash', async () => {
    const log = await prisma.auditLog.findFirst({
      where: { acao: 'CRIAR_USUARIO', userId: ADMIN_ID },
      orderBy: { criadoEm: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log!.userId).toBeDefined();
    expect(log!.acao).toBeDefined();
    expect(log!.entidade).toBeDefined();
    expect(log!.entidadeId).toBeDefined();
    expect(log!.criadoEm).toBeDefined();

    // No password or hash in detalhe
    const detalheStr = JSON.stringify(log!.detalhe);
    expect(detalheStr).not.toContain('senhaHash');
    expect(detalheStr).not.toContain('password');
  });

  it('4. GET /api/auditoria returns paginated list', async () => {
    const res = await authFetch(`${getBase()}/api/auditoria?page=1&limit=10`, adminToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('5. GET /api/auditoria filters by entidade + entidadeId', async () => {
    const targetId = CREATED_IDS[0]!;
    const res = await authFetch(
      `${getBase()}/api/auditoria?entidade=USER&entidadeId=${targetId}`,
      adminToken,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    // All returned rows should match the filter
    for (const row of body.data) {
      expect(row.entidade).toBe('USER');
      expect(row.entidadeId).toBe(targetId);
    }
  });
});
