// P1.6 — End-to-end workflow test.
// Covers the full lifecycle: ADMIN creates user → OPERADOR logs in →
// creates inspection → fills responses → integrity check → conclude →
// GESTOR validates → audit trail verification.
//
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
} from './test-helpers.js';

// ── Test-scoped IDs ──────────────────────────────────────────────────
const E2E_ADMIN_ID = 'usr-e2e-admin-wf';
const E2E_GESTOR_ID = 'usr-e2e-gestor-wf';
const E2E_EQUIP_ID = 'eq-e2e-wf-001';
const E2E_MODELO_ID = 'mod-e2e-wf-001';
const E2E_ITEM_STATUS_ID = 'item-e2e-status';
const E2E_ITEM_CERT_ID = 'item-e2e-cert';
const E2E_ITEM_TEXTO_ID = 'item-e2e-texto';
const E2E_INSP_ID = 'insp-e2e-wf-001';

let adminToken: string;
let gestorToken: string;
let operadorToken: string;
let createdOperadorId: string;

beforeAll(async () => {
  if (!HAS_DB) return;
  await startServer();

  // Seed ADMIN + GESTOR
  await seedUser({
    id: E2E_ADMIN_ID,
    nome: 'Admin E2E',
    cpf: '10020030041',
    funcao: 'ADMIN',
    senha: 'admin1',
  });
  await seedUser({
    id: E2E_GESTOR_ID,
    nome: 'Gestor E2E',
    cpf: '10020030042',
    funcao: 'GESTOR',
    senha: 'gest01',
  });

  adminToken = tokenFor(E2E_ADMIN_ID, 'Admin E2E', 'ADMIN');
  gestorToken = tokenFor(E2E_GESTOR_ID, 'Gestor E2E', 'GESTOR');

  // Seed equipment
  await prisma.equipamento.upsert({
    where: { id: E2E_EQUIP_ID },
    update: {},
    create: { id: E2E_EQUIP_ID, codigo: 'EQ-E2E-WF', nome: 'Equip E2E Workflow', tipo: 'Compressor' },
  });

  // Seed modelo with 3 mandatory items (STATUS, CERTIFICADO, TEXTO)
  await prisma.checklistModelo.upsert({
    where: { id: E2E_MODELO_ID },
    update: {},
    create: { id: E2E_MODELO_ID, nome: 'Modelo E2E', tipoEquipamento: 'Compressor', ativo: true },
  });
  await prisma.itemChecklist.createMany({
    data: [
      { id: E2E_ITEM_STATUS_ID, modeloId: E2E_MODELO_ID, secao: 'GERAL', descricao: 'Check visual', ordem: 1, obrigatorio: true, tipo: 'STATUS' },
      { id: E2E_ITEM_CERT_ID, modeloId: E2E_MODELO_ID, secao: 'CERTIFICADOS', descricao: 'Cert NR13', ordem: 2, obrigatorio: true, tipo: 'CERTIFICADO' },
      { id: E2E_ITEM_TEXTO_ID, modeloId: E2E_MODELO_ID, secao: 'OBSERVACOES', descricao: 'Observacao campo', ordem: 3, obrigatorio: true, tipo: 'TEXTO' },
    ],
    skipDuplicates: true,
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  // Clean in dependency order
  await prisma.auditLog.deleteMany({ where: { userId: { in: [E2E_ADMIN_ID, E2E_GESTOR_ID, createdOperadorId].filter(Boolean) as string[] } } });
  await prisma.respostaItem.deleteMany({ where: { inspecaoId: E2E_INSP_ID } });
  await prisma.inspecao.deleteMany({ where: { id: E2E_INSP_ID } });
  await prisma.itemChecklist.deleteMany({ where: { modeloId: E2E_MODELO_ID } });
  await prisma.checklistModelo.deleteMany({ where: { id: E2E_MODELO_ID } });
  await prisma.equipamento.deleteMany({ where: { id: E2E_EQUIP_ID } });
  if (createdOperadorId) await deleteUser(createdOperadorId);
  await deleteUser(E2E_ADMIN_ID);
  await deleteUser(E2E_GESTOR_ID);
  await stopServer();
});

describe.skipIf(!HAS_DB)('Full workflow E2E', () => {
  // Step 1: ADMIN creates OPERADOR
  it('Step 1: ADMIN creates OPERADOR user', async () => {
    const res = await authFetch(`${getBase()}/api/users`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Operador E2E',
        cpf: '60070080091',
        funcao: 'OPERADOR',
        senha: 'campo1',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.funcao).toBe('OPERADOR');
    createdOperadorId = body.id;
  });

  // Step 2: OPERADOR logs in
  it('Step 2: OPERADOR logs in with new credentials', async () => {
    const res = await fetch(`${getBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '600.700.800-91', senha: 'campo1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    operadorToken = body.token;
  });

  // Step 3: Start inspection (POST /api/inspecoes/:id/iniciar)
  it('Step 3: Start inspection', async () => {
    const res = await authFetch(`${getBase()}/api/inspecoes/${E2E_INSP_ID}/iniciar`, operadorToken, {
      method: 'POST',
      body: JSON.stringify({
        equipamentoId: E2E_EQUIP_ID,
        tipo: 'PRE_EMBARQUE',
        modeloId: E2E_MODELO_ID,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('EM_ANDAMENTO');
    expect(body.id).toBe(E2E_INSP_ID);
  });

  // Step 4: Fill responses via PATCH /api/inspecoes/:id/respostas
  it('Step 4: Fill all responses', async () => {
    const res = await authFetch(`${getBase()}/api/inspecoes/${E2E_INSP_ID}/respostas`, operadorToken, {
      method: 'PATCH',
      body: JSON.stringify({
        alteracoes: [
          { itemId: E2E_ITEM_STATUS_ID, status: 'OK' },
          { itemId: E2E_ITEM_CERT_ID, certificadoId: 'cert-nr13-001', certificadoValidade: '2028-12-31T12:00:00Z' },
          { itemId: E2E_ITEM_TEXTO_ID, valorTexto: 'Equipamento em boas condições' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  // Step 5: Check integrity report
  it('Step 5: Integrity report shows high completude', async () => {
    const res = await authFetch(`${getBase()}/api/inspecoes/${E2E_INSP_ID}/integridade`, operadorToken);
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.completude).toBe(100);
    // Not approved yet because no signature/photos
    expect(report.temAssinatura).toBe(false);
  });

  // Step 6: Conclude inspection (PUT with status=CONCLUIDA + signature + photos)
  it('Step 6: Conclude inspection', async () => {
    const res = await authFetch(`${getBase()}/api/inspecoes/${E2E_INSP_ID}`, operadorToken, {
      method: 'PUT',
      body: JSON.stringify({
        equipamentoId: E2E_EQUIP_ID,
        tipo: 'PRE_EMBARQUE',
        modeloId: E2E_MODELO_ID,
        status: 'CONCLUIDA',
        assinaturaUrl: 'https://drive/assinatura-e2e.png',
        fotosUrls: ['https://drive/foto-e2e.jpg'],
        respostas: [
          { itemId: E2E_ITEM_STATUS_ID, status: 'OK' },
          { itemId: E2E_ITEM_CERT_ID, certificadoId: 'cert-nr13-001', certificadoValidade: '2028-12-31T12:00:00Z' },
          { itemId: E2E_ITEM_TEXTO_ID, valorTexto: 'Equipamento em boas condições' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('CONCLUIDA');
    // Preflight integridade should always be returned for CONCLUIDA
    expect(body._integridade).toBeDefined();
    expect(body._integridade.completude).toBe(100);
    expect(body._integridade.aprovado).toBe(true);
  });

  // Step 7: GESTOR validates
  it('Step 7: GESTOR validates the inspection', async () => {
    const res = await authFetch(`${getBase()}/api/inspecoes/${E2E_INSP_ID}/validar`, gestorToken, {
      method: 'PATCH',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('VALIDADA');
    expect(body.validadaPorId).toBe(E2E_GESTOR_ID);
  });

  // Step 8: Verify state transitions and DB state
  it('Step 8: Verify final DB state', async () => {
    const insp = await prisma.inspecao.findUnique({
      where: { id: E2E_INSP_ID },
      include: { respostas: true },
    });
    expect(insp).not.toBeNull();
    expect(insp!.status).toBe('VALIDADA');
    expect(insp!.respostas.length).toBeGreaterThanOrEqual(3);
  });

  // Step 9: Verify audit trail
  it('Step 9: Audit trail has expected entries', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { entidade: 'INSPECAO', entidadeId: E2E_INSP_ID },
      orderBy: { criadoEm: 'asc' },
    });
    // Should have at least CRIAR_INSPECAO (from iniciar + PUT CONCLUIDA) and VALIDAR_INSPECAO
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const acoes = logs.map((l) => l.acao);
    expect(acoes).toContain('CRIAR_INSPECAO');
    expect(acoes).toContain('VALIDAR_INSPECAO');
  });

  // Step 10: Equipment status updated after validation
  it('Step 10: Equipment statusLiberacao updated', async () => {
    const eq = await prisma.equipamento.findUnique({ where: { id: E2E_EQUIP_ID } });
    expect(eq).not.toBeNull();
    // After validation with all items OK and no unresolved PENDENTE,
    // calcularStatusLiberacao returns 'LIBERADO'
    expect(eq!.statusLiberacao).toBe('LIBERADO');
  });
});
