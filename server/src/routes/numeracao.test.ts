// Numeração sequencial por equipamento (OPE-PC-03/{codigo}/{NNN}).
// Requer DATABASE_URL (Prisma real). Pulado quando não há banco.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startServer,
  stopServer,
  getBase,
  seedUser,
  tokenFor,
  prisma,
  HAS_DB,
} from '../test-helpers.js';

const OP_ID = 'usr-num-op';
const EQUIP_A = 'eq-num-a';
const EQUIP_B = 'eq-num-b';
const CODIGO_A = 'NUM-A-001';
const CODIGO_B = 'NUM-B-002';

let token: string;

function iniciar(id: string, equipamentoId: string) {
  return fetch(`${getBase()}/api/inspecoes/${encodeURIComponent(id)}/iniciar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ equipamentoId, tipo: 'OPERACIONAL' }),
  });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await startServer();
  await seedUser({ id: OP_ID, nome: 'Op Numeracao', cpf: '99911122233', funcao: 'OPERADOR', senha: 'op1234' });
  token = tokenFor(OP_ID, 'Op Numeracao', 'OPERADOR');
  await prisma.equipamento.upsert({
    where: { id: EQUIP_A },
    update: {},
    create: { id: EQUIP_A, codigo: CODIGO_A, nome: 'Equip Num A', tipo: 'Compressor' },
  });
  await prisma.equipamento.upsert({
    where: { id: EQUIP_B },
    update: {},
    create: { id: EQUIP_B, codigo: CODIGO_B, nome: 'Equip Num B', tipo: 'Compressor' },
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  const ids = ['insp-num-a1', 'insp-num-a2', 'insp-num-b1', 'insp-num-conc'];
  await prisma.inspecao.deleteMany({ where: { id: { in: ids } } });
  await prisma.inspecaoSequencia.deleteMany({ where: { equipamentoId: { in: [EQUIP_A, EQUIP_B] } } });
  await prisma.equipamento.deleteMany({ where: { id: { in: [EQUIP_A, EQUIP_B] } } });
  await stopServer();
});

describe.skipIf(!HAS_DB)('Numeração sequencial por equipamento', () => {
  it('1ª inspeção do equipamento → sequência 001 no formato OPE-PC-03/{codigo}/{NNN}', async () => {
    const res = await iniciar('insp-num-a1', EQUIP_A);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.numeroDocumento).toBe(`OPE-PC-03/${CODIGO_A}/001`);
  });

  it('2ª inspeção do mesmo equipamento → 002', async () => {
    const res = await iniciar('insp-num-a2', EQUIP_A);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.numeroDocumento).toBe(`OPE-PC-03/${CODIGO_A}/002`);
  });

  it('equipamento diferente tem sequência própria → 001', async () => {
    const res = await iniciar('insp-num-b1', EQUIP_B);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.numeroDocumento).toBe(`OPE-PC-03/${CODIGO_B}/001`);
  });

  it('chamada repetida no mesmo id é idempotente — não incrementa o contador', async () => {
    const res = await iniciar('insp-num-a1', EQUIP_A);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Continua com o número da 1ª criação, não gera um novo.
    expect(body.numeroDocumento).toBe(`OPE-PC-03/${CODIGO_A}/001`);
    // O contador do equipamento A segue em 2 (a1 e a2), não avançou.
    const seq = await prisma.inspecaoSequencia.findUnique({ where: { equipamentoId: EQUIP_A } });
    expect(seq?.valor).toBe(2);
  });

  it('duas requisições concorrentes no mesmo id → uma cria, ambas 2xx, mesmo número (sem 500)', async () => {
    const [r1, r2] = await Promise.all([
      iniciar('insp-num-conc', EQUIP_B),
      iniciar('insp-num-conc', EQUIP_B),
    ]);
    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);
    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
    expect(b1.numeroDocumento).toBe(b2.numeroDocumento);
    // Só uma inspeção criada com esse id.
    const count = await prisma.inspecao.count({ where: { id: 'insp-num-conc' } });
    expect(count).toBe(1);
  });

  it('GET /api/inspecoes/mine devolve numeroDocumento', async () => {
    const res = await fetch(`${getBase()}/api/inspecoes/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const lista = await res.json();
    const a1 = lista.find((i: any) => i.id === 'insp-num-a1');
    expect(a1?.numeroDocumento).toBe(`OPE-PC-03/${CODIGO_A}/001`);
  });
});
