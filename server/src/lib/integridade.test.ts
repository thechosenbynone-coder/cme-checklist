// Tests for the integridade engine (pure function — no DB required).
import { describe, it, expect } from 'vitest';
import { calcularIntegridade, type IntegridadeOpts } from './integridade.js';
import type { Inspecao, ItemChecklist, RespostaItem } from '@cme/types';

// ── Helpers ──────────────────────────────────────────────────────────

/** Minimal valid inspecao with signature + photo (meets approval prerequisites). */
function makeInspecao(overrides: Partial<Inspecao> = {}): Inspecao {
  return {
    id: 'insp-1',
    equipamentoId: 'eq-1',
    tipo: 'PRE_EMBARQUE',
    data: '2026-06-01T00:00:00Z',
    status: 'EM_ANDAMENTO',
    respostas: [],
    materiais: [],
    assinaturaUrl: 'https://drive/assinatura.png',
    fotosUrls: ['https://drive/foto1.jpg'],
    ...overrides,
  };
}

function makeItem(overrides: Partial<ItemChecklist> = {}): ItemChecklist {
  return {
    id: 'item-1',
    modeloId: 'mod-1',
    secao: 'GERAL',
    descricao: 'Item genérico',
    ordem: 1,
    obrigatorio: true,
    tipo: 'STATUS',
    ...overrides,
  };
}

function makeResposta(overrides: Partial<RespostaItem> = {}): RespostaItem {
  return {
    id: 'resp-1',
    inspecaoId: 'insp-1',
    itemId: 'item-1',
    ...overrides,
  };
}

// Fixed date for deterministic tests (2026-06-15 noon UTC).
const AGORA = new Date('2026-06-15T12:00:00Z');
const OPTS: IntegridadeOpts = { agora: AGORA, timezone: 'America/Sao_Paulo' };

// ── 14 Core Scenarios + 4 Edge Cases (18 total) ─────────────────────

describe('calcularIntegridade', () => {
  it('1. 100% complete inspection → completude=100, aprovado=true', () => {
    const item = makeItem({ id: 'it-ok', tipo: 'STATUS' });
    const resp = makeResposta({ itemId: 'it-ok', status: 'OK' });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.completude).toBe(100);
    expect(report.aprovado).toBe(true);
  });

  it('2. Empty inspection (no responses) → completude=0, aprovado=false', () => {
    const item = makeItem();
    const insp = makeInspecao({ respostas: [] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.completude).toBe(0);
    expect(report.aprovado).toBe(false);
  });

  it('3. Zero mandatory items → completude=100 (no division by zero)', () => {
    const item = makeItem({ obrigatorio: false });
    const insp = makeInspecao({ respostas: [] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.completude).toBe(100);
  });

  it('4. STATUS OK → always satisfies', () => {
    const item = makeItem({ id: 'it-ok', tipo: 'STATUS' });
    const resp = makeResposta({ itemId: 'it-ok', status: 'OK' });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(1);
    expect(report.itensObrigatoriosPendentes).toHaveLength(0);
  });

  it('5. STATUS NAO_APLICAVEL with observacao → satisfies', () => {
    const item = makeItem({ id: 'it-na', tipo: 'STATUS' });
    const resp = makeResposta({
      itemId: 'it-na',
      status: 'NAO_APLICAVEL',
      observacao: 'Não se aplica a este equipamento',
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(1);
    expect(report.itensObrigatoriosPendentes).toHaveLength(0);
  });

  it('6. STATUS NAO_APLICAVEL without observacao → pending', () => {
    const item = makeItem({ id: 'it-na2', tipo: 'STATUS' });
    const resp = makeResposta({
      itemId: 'it-na2',
      status: 'NAO_APLICAVEL',
      observacao: undefined,
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(0);
    expect(report.itensObrigatoriosPendentes).toContainEqual(
      expect.objectContaining({ itemId: 'it-na2' }),
    );
  });

  it('7. STATUS PENDENTE with evidence (photo) → satisfies', () => {
    const item = makeItem({ id: 'it-pend', tipo: 'STATUS' });
    const resp = makeResposta({
      itemId: 'it-pend',
      status: 'PENDENTE',
      pendenciaResolvida: true,
      fotoResolvidaUrl: 'https://drive/resolved.jpg',
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(1);
    expect(report.evidenciasFaltantes).toHaveLength(0);
  });

  it('8. STATUS PENDENTE with evidence (video) → satisfies', () => {
    const item = makeItem({ id: 'it-pend-v', tipo: 'STATUS' });
    const resp = makeResposta({
      itemId: 'it-pend-v',
      status: 'PENDENTE',
      pendenciaResolvida: true,
      videoUrl: 'https://drive/resolved.mp4',
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(1);
    expect(report.evidenciasFaltantes).toHaveLength(0);
  });

  it('9. STATUS PENDENTE without evidence → pending, listed once (no duplication)', () => {
    const item = makeItem({ id: 'it-pend-ne', tipo: 'STATUS' });
    const resp = makeResposta({
      itemId: 'it-pend-ne',
      status: 'PENDENTE',
      pendenciaResolvida: false,
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(0);
    // Listed in evidenciasFaltantes (not duplicated in itensObrigatoriosPendentes)
    expect(report.evidenciasFaltantes).toHaveLength(1);
    expect(report.evidenciasFaltantes[0].itemId).toBe('it-pend-ne');
    expect(report.itensObrigatoriosPendentes).toHaveLength(0);
  });

  it('10. CERTIFICADO valid (future date) → satisfies', () => {
    const item = makeItem({ id: 'it-cert', tipo: 'CERTIFICADO' });
    const resp = makeResposta({
      itemId: 'it-cert',
      certificadoId: 'cert-123',
      certificadoValidade: '2027-12-31',
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(1);
    expect(report.certificadosVencidos).toHaveLength(0);
  });

  it('11. CERTIFICADO expired (past date) → listed in certificadosVencidos', () => {
    const item = makeItem({ id: 'it-cert-exp', tipo: 'CERTIFICADO', descricao: 'NR13' });
    const resp = makeResposta({
      itemId: 'it-cert-exp',
      certificadoId: 'cert-456',
      certificadoValidade: '2025-01-01',
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(0);
    expect(report.certificadosVencidos).toHaveLength(1);
    expect(report.certificadosVencidos[0].itemId).toBe('it-cert-exp');
  });

  it('12. MEDICAO with 0 → satisfies (zero is valid)', () => {
    const item = makeItem({ id: 'it-med', tipo: 'MEDICAO' });
    const resp = makeResposta({
      itemId: 'it-med',
      valorNumerico: 0,
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(1);
    expect(report.itensObrigatoriosPendentes).toHaveLength(0);
  });

  it('13. MEDICAO null → pending', () => {
    const item = makeItem({ id: 'it-med-null', tipo: 'MEDICAO' });
    const resp = makeResposta({
      itemId: 'it-med-null',
      valorNumerico: undefined,
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(0);
    expect(report.itensObrigatoriosPendentes).toContainEqual(
      expect.objectContaining({ itemId: 'it-med-null' }),
    );
  });

  it('14. TEXTO empty or whitespace → pending', () => {
    const item = makeItem({ id: 'it-txt', tipo: 'TEXTO' });
    const resp = makeResposta({
      itemId: 'it-txt',
      valorTexto: '   ',
    });
    const insp = makeInspecao({ respostas: [resp] });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.itensRespondidos).toBe(0);
    expect(report.itensObrigatoriosPendentes).toContainEqual(
      expect.objectContaining({ itemId: 'it-txt' }),
    );
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────

describe('calcularIntegridade — edge cases', () => {
  it('certificate expiry at day boundary: today = valid, yesterday = expired', () => {
    const item = makeItem({ id: 'it-boundary', tipo: 'CERTIFICADO', descricao: 'Cert boundary' });

    // AGORA = 2026-06-15T12:00:00Z → in São Paulo (UTC-3) = June 15 09:00.
    // inicioDoDia uses Intl to get the local date, then returns T12:00:00Z of that date.
    // So for AGORA, "today" in SP = June 15 → inicioDoDia = 2026-06-15T12:00:00Z.
    //
    // For the certificate date, new Date('2026-06-15') = 2026-06-15T00:00:00Z
    // which in SP is June 14 21:00 → inicioDoDia = 2026-06-14T12:00:00Z.
    // So we must provide a datetime that IS June 15 in São Paulo timezone.
    // '2026-06-15T15:00:00Z' in SP = June 15 12:00 → same day as AGORA → valid.

    const respToday = makeResposta({
      itemId: 'it-boundary',
      certificadoId: 'cert-today',
      certificadoValidade: '2026-06-15T15:00:00Z', // June 15 in SP
    });
    const inspToday = makeInspecao({ respostas: [respToday] });
    const reportToday = calcularIntegridade(inspToday, [item], OPTS);
    expect(reportToday.certificadosVencidos).toHaveLength(0);
    expect(reportToday.itensRespondidos).toBe(1);

    // "Yesterday" in SP = expired. '2026-06-14T15:00:00Z' in SP = June 14 12:00
    const respYesterday = makeResposta({
      itemId: 'it-boundary',
      certificadoId: 'cert-yesterday',
      certificadoValidade: '2026-06-14T15:00:00Z', // June 14 in SP
    });
    const inspYesterday = makeInspecao({ respostas: [respYesterday] });
    const reportYesterday = calcularIntegridade(inspYesterday, [item], OPTS);
    expect(reportYesterday.certificadosVencidos).toHaveLength(1);
  });

  it('fotos array with empty strings filtered by naoVazio()', () => {
    const item = makeItem({ id: 'it-ok2', tipo: 'STATUS' });
    const resp = makeResposta({ itemId: 'it-ok2', status: 'OK' });
    // fotosUrls has only empty strings — should NOT count as having photos
    const insp = makeInspecao({
      respostas: [resp],
      fotosUrls: ['', '  ', ''],
      videoUrl: undefined,
    });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.temFotosOuVideoEquipamento).toBe(false);
    expect(report.aprovado).toBe(false);
  });

  it('no signature → aprovado=false regardless of items', () => {
    const item = makeItem({ id: 'it-ok3', tipo: 'STATUS' });
    const resp = makeResposta({ itemId: 'it-ok3', status: 'OK' });
    const insp = makeInspecao({
      respostas: [resp],
      assinaturaUrl: undefined,
    });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.temAssinatura).toBe(false);
    expect(report.completude).toBe(100);
    expect(report.aprovado).toBe(false);
  });

  it('video counts as equipment evidence (no photos needed)', () => {
    const item = makeItem({ id: 'it-ok4', tipo: 'STATUS' });
    const resp = makeResposta({ itemId: 'it-ok4', status: 'OK' });
    const insp = makeInspecao({
      respostas: [resp],
      fotosUrls: [],
      videoUrl: 'https://drive/video.mp4',
    });

    const report = calcularIntegridade(insp, [item], OPTS);

    expect(report.temFotosOuVideoEquipamento).toBe(true);
    expect(report.aprovado).toBe(true);
  });
});
