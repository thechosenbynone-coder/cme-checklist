// P1.4 — Validation gate tests (PATCH /api/inspecoes/:id/validar).
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

// ── Test-scoped IDs ──────────────────────────────────────────────────
const GESTOR_ID = 'usr-gestor-val-test';
const OPERADOR_ID = 'usr-op-val-test';
const EQUIP_ID = 'eq-val-test-001';
const MODELO_ID = 'mod-val-test-001';
const ITEM_ID = 'item-val-test-001';
const INSP_COMPLETE_ID = 'insp-val-complete';
const INSP_INCOMPLETE_ID = 'insp-val-incomplete';
const INSP_EMANDAMENTO_ID = 'insp-val-emandamento';
const INSP_NOMODEL_ID = 'insp-val-nomodel';

let gestorToken: string;

beforeAll(async () => {
  if (!HAS_DB) return;
  await startServer();

  // Seed users
  await seedUser({ id: GESTOR_ID, nome: 'Gestor Validacao', cpf: '77700100120', funcao: 'GESTOR', senha: 'ges123' });
  await seedUser({ id: OPERADOR_ID, nome: 'Op Validacao', cpf: '77700200220', funcao: 'OPERADOR', senha: 'op1234' });
  gestorToken = tokenFor(GESTOR_ID, 'Gestor Validacao', 'GESTOR');

  // Seed equipment
  await prisma.equipamento.upsert({
    where: { id: EQUIP_ID },
    update: {},
    create: { id: EQUIP_ID, codigo: 'EQ-VAL-001', nome: 'Equip Validacao', tipo: 'Compressor' },
  });

  // Seed modelo + 1 mandatory STATUS item
  await prisma.checklistModelo.upsert({
    where: { id: MODELO_ID },
    update: {},
    create: { id: MODELO_ID, nome: 'Modelo Val Test', tipoEquipamento: 'Compressor', ativo: true },
  });
  await prisma.itemChecklist.upsert({
    where: { id: ITEM_ID },
    update: {},
    create: { id: ITEM_ID, modeloId: MODELO_ID, secao: 'GERAL', descricao: 'Item OK', ordem: 1, obrigatorio: true, tipo: 'STATUS' },
  });

  // ── Complete inspection (all responses, signature, photos) ─────
  await prisma.inspecao.upsert({
    where: { id: INSP_COMPLETE_ID },
    update: { status: 'CONCLUIDA' },
    create: {
      id: INSP_COMPLETE_ID,
      equipamentoId: EQUIP_ID,
      tipo: 'PRE_EMBARQUE',
      status: 'CONCLUIDA',
      modeloId: MODELO_ID,
      assinaturaUrl: 'https://drive/sig.png',
      fotosUrls: ['https://drive/foto.jpg'],
      createdById: OPERADOR_ID,
    },
  });
  await prisma.respostaItem.upsert({
    where: { inspecaoId_itemId: { inspecaoId: INSP_COMPLETE_ID, itemId: ITEM_ID } },
    update: { status: 'OK' },
    create: { inspecaoId: INSP_COMPLETE_ID, itemId: ITEM_ID, status: 'OK' },
  });

  // ── Incomplete inspection (no response → integridade fails) ────
  await prisma.inspecao.upsert({
    where: { id: INSP_INCOMPLETE_ID },
    update: { status: 'CONCLUIDA' },
    create: {
      id: INSP_INCOMPLETE_ID,
      equipamentoId: EQUIP_ID,
      tipo: 'PRE_EMBARQUE',
      status: 'CONCLUIDA',
      modeloId: MODELO_ID,
      createdById: OPERADOR_ID,
    },
  });

  // ── EM_ANDAMENTO inspection (wrong status for validation) ──────
  await prisma.inspecao.upsert({
    where: { id: INSP_EMANDAMENTO_ID },
    update: { status: 'EM_ANDAMENTO' },
    create: {
      id: INSP_EMANDAMENTO_ID,
      equipamentoId: EQUIP_ID,
      tipo: 'PRE_EMBARQUE',
      status: 'EM_ANDAMENTO',
      modeloId: MODELO_ID,
      createdById: OPERADOR_ID,
    },
  });

  // ── Inspection without model ───────────────────────────────────
  await prisma.inspecao.upsert({
    where: { id: INSP_NOMODEL_ID },
    update: { status: 'CONCLUIDA' },
    create: {
      id: INSP_NOMODEL_ID,
      equipamentoId: EQUIP_ID,
      tipo: 'PRE_EMBARQUE',
      status: 'CONCLUIDA',
      modeloId: null,
      createdById: OPERADOR_ID,
    },
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  // Clean up in dependency order
  await prisma.respostaItem.deleteMany({
    where: { inspecaoId: { in: [INSP_COMPLETE_ID, INSP_INCOMPLETE_ID, INSP_EMANDAMENTO_ID, INSP_NOMODEL_ID] } },
  });
  await prisma.inspecao.deleteMany({
    where: { id: { in: [INSP_COMPLETE_ID, INSP_INCOMPLETE_ID, INSP_EMANDAMENTO_ID, INSP_NOMODEL_ID] } },
  });
  await prisma.itemChecklist.deleteMany({ where: { modeloId: MODELO_ID } });
  await prisma.checklistModelo.deleteMany({ where: { id: MODELO_ID } });
  await prisma.equipamento.deleteMany({ where: { id: EQUIP_ID } });
  await deleteUser(GESTOR_ID);
  await deleteUser(OPERADOR_ID);
  await stopServer();
});

describe.skipIf(!HAS_DB)('PATCH /api/inspecoes/:id/validar', () => {
  it('1. Incomplete inspection → 422 with integridade report', async () => {
    const res = await authFetch(
      `${getBase()}/api/inspecoes/${INSP_INCOMPLETE_ID}/validar`,
      gestorToken,
      { method: 'PATCH' },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.integridade).toBeDefined();
    expect(body.integridade.aprovado).toBe(false);
  });

  it('2. Complete inspection → 200, status VALIDADA', async () => {
    const res = await authFetch(
      `${getBase()}/api/inspecoes/${INSP_COMPLETE_ID}/validar`,
      gestorToken,
      { method: 'PATCH' },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('VALIDADA');
    expect(body.validadaPorId).toBe(GESTOR_ID);
    expect(body.validadaEm).toBeDefined();
  });

  it('3. Wrong status (EM_ANDAMENTO) → 409', async () => {
    const res = await authFetch(
      `${getBase()}/api/inspecoes/${INSP_EMANDAMENTO_ID}/validar`,
      gestorToken,
      { method: 'PATCH' },
    );
    expect(res.status).toBe(409);
  });

  it('4. Inspection without model → 422', async () => {
    const res = await authFetch(
      `${getBase()}/api/inspecoes/${INSP_NOMODEL_ID}/validar`,
      gestorToken,
      { method: 'PATCH' },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('modelo');
  });

  it('5. Already validated → 409', async () => {
    // INSP_COMPLETE_ID was validated in test 2
    const res = await authFetch(
      `${getBase()}/api/inspecoes/${INSP_COMPLETE_ID}/validar`,
      gestorToken,
      { method: 'PATCH' },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('já validada');
  });
});
