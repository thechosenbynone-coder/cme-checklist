// Parser da planilha de equipamentos (LOCALIZAÇÃO_EQUIPAMENTOS).
// Funções puras (sem DB) — reutilizáveis pelo script de importação e pela busca do servidor.
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';

// Aba -> tipo de equipamento. AFTECOOLLER mapeia para "After Cooler" (casa com o template existente).
export const TIPO_POR_ABA: Record<string, string> = {
  AFTECOOLLER: 'After Cooler',
  BOOSTER: 'Booster',
  'BOMBA LIMPEZA QUIMICA': 'Bomba de Limpeza Química',
  CALDEIRA: 'Caldeira',
  CONTAINER: 'Container',
  'CONTAINER HIDROJATO': 'Container Hidrojato',
  MEMBRANA: 'Membrana',
  'QUAD GAS': 'Quad de Gás',
  COMPRESSORES: 'Compressor',
  SAAD: 'SAAD',
  MOLSIEVE: 'Molsieve',
  'VASO DE PRESSÃO': 'Vaso de Pressão',
  TANQUE: 'Tanque',
  DIVERSOS: 'Diversos',
};

// Aba ignorada (resumo redundante).
export const ABA_IGNORADA = 'GERAL';

// Código canônico: maiúsculas, separadores -> hífen, remove sufixo entre parênteses.
export function codigoCanonico(raw: unknown): string {
  return String(raw)
    .split('(')[0]
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Chave de busca: só alfanumérico maiúsculo (faz junto/separado/pontuado casarem).
export function normalizeChave(raw: unknown): string {
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Serial de data do Excel -> ISO (YYYY-MM-DD). Retorna null para valores não numéricos.
export function serialParaISO(s: unknown): string | null {
  if (typeof s !== 'number' || !isFinite(s)) return null;
  const ms = Math.round((s - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Valores que indicam ausência de eslinga/certificado.
function semEslinga(v: unknown): boolean {
  if (v == null) return true;
  const s = String(v).trim().toUpperCase();
  return s === '' || s === 'S/ESLINGA' || s === 'VERIF.' || /^\*+$/.test(s) || /^\?+$/.test(s);
}

export interface CertificadoParse {
  tipo: string;
  numero?: string;
  validade?: string | null;
}

export interface EquipamentoParse {
  codigo: string;        // canônico
  codigoExibicao: string;
  chaveBusca: string;
  nome: string;
  tipo: string;
  localizacaoAtual: string | null;
  validadeCertificado: string | null;
  dadosPlanilha: Record<string, unknown>;
  certificados: CertificadoParse[];
  _aba: string;
}

// Parseia uma aba (array de arrays, header na linha 0).
export function parseAba(aba: string, rows: any[][]): EquipamentoParse[] {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map((h) => (h == null ? '' : String(h)));
  const tipo = TIPO_POR_ABA[aba] || aba;

  const atualIdx = header.indexOf('ATUAL');
  const eslingaIdx = header.indexOf('ESLINGA');
  const validadeEquipIdx = header.indexOf('VALIDADE'); // 1ª ocorrência (antes da eslinga)
  const validadeEslingaIdx =
    eslingaIdx >= 0 ? header.indexOf('VALIDADE', eslingaIdx + 1) : -1;

  const out: EquipamentoParse[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const idRaw = row[0];
    if (idRaw == null || String(idRaw).trim() === '') continue;

    const codigoExibicao = String(idRaw).trim();
    const codigo = codigoCanonico(idRaw);
    if (!codigo) continue;

    // dados_planilha: preserva TODAS as colunas (duplicata VALIDADE -> "VALIDADE (ESLINGA)").
    const dadosPlanilha: Record<string, unknown> = { _aba: aba, _linha: r };
    const usados = new Set<string>();
    header.forEach((h, i) => {
      let key = h && h.trim() ? h.trim() : `COL_${i}`;
      if (usados.has(key)) key = `${key} (ESLINGA)`;
      usados.add(key);
      dadosPlanilha[key] = row[i] ?? null;
    });

    const validadeCertificado = validadeEquipIdx >= 0 ? serialParaISO(row[validadeEquipIdx]) : null;

    const certificados: CertificadoParse[] = [];
    if (validadeCertificado) {
      certificados.push({ tipo: 'EQUIPAMENTO', validade: validadeCertificado });
    }
    if (eslingaIdx >= 0 && !semEslinga(row[eslingaIdx])) {
      certificados.push({
        tipo: 'ESLINGA',
        numero: String(row[eslingaIdx]).trim(),
        validade: validadeEslingaIdx >= 0 ? serialParaISO(row[validadeEslingaIdx]) : null,
      });
    }

    out.push({
      codigo,
      codigoExibicao,
      chaveBusca: normalizeChave(codigoExibicao),
      nome: `${tipo} ${codigoExibicao}`,
      tipo,
      localizacaoAtual: atualIdx >= 0 ? (row[atualIdx] != null ? String(row[atualIdx]) : null) : null,
      validadeCertificado,
      dadosPlanilha,
      certificados,
      _aba: aba,
    });
  }
  return out;
}

export interface ParseResult {
  equipamentos: EquipamentoParse[];
  duplicados: string[]; // códigos canônicos que apareceram mais de uma vez
  porAba: Record<string, number>;
}

// Parseia o arquivo inteiro (ignora GERAL) e dedup por código canônico (primeiro vence).
export function parseWorkbook(filePath: string): ParseResult {
  const wb = XLSX.read(readFileSync(filePath), { type: 'buffer' });
  const porAba: Record<string, number> = {};
  const vistos = new Map<string, EquipamentoParse>();
  const duplicados: string[] = [];

  for (const aba of wb.SheetNames) {
    if (aba === ABA_IGNORADA) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[aba], {
      header: 1,
      defval: null,
      blankrows: false,
    });
    const itens = parseAba(aba, rows);
    porAba[aba] = itens.length;
    for (const it of itens) {
      if (vistos.has(it.codigo)) {
        duplicados.push(it.codigo);
        continue;
      }
      vistos.set(it.codigo, it);
    }
  }

  return { equipamentos: [...vistos.values()], duplicados, porAba };
}
