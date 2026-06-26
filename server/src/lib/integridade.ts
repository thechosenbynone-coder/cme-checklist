// Engine de integridade de inspeção (ISO 9001).
// Função pura: recebe a inspeção (com respostas) + os itens do modelo exato
// associado à inspeção e retorna um relatório de completude/conformidade.
// Sem efeitos colaterais — permite testes determinísticos via `opts.agora`.
import type { Inspecao, ItemChecklist, RespostaItem, IntegridadeReport } from '@cme/types';

export interface IntegridadeOpts {
  agora?: Date;       // default: new Date()
  timezone?: string;  // default: 'America/Sao_Paulo'
}

const BUSINESS_TIMEZONE = 'America/Sao_Paulo';

// Início do dia atual no fuso de negócio. Usa Intl (respeita horário de verão)
// em vez de offset fixo, evitando bugs em transições de DST.
function inicioDoDia(agora: Date, timezone: string): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const partes = fmt.formatToParts(agora);
  const y = partes.find((p) => p.type === 'year')!.value;
  const m = partes.find((p) => p.type === 'month')!.value;
  const d = partes.find((p) => p.type === 'day')!.value;
  // Meio-dia UTC do dia local evita ambiguidade de borda na conversão.
  return new Date(`${y}-${m}-${d}T12:00:00Z`);
}

// Um certificado está vencido quando sua validade é anterior ao dia corrente
// (no fuso de negócio). Validade de hoje = válido.
function certificadoVencido(validade: string | null | undefined, agora: Date, timezone: string): boolean {
  if (!validade) return false; // ausência de validade é tratada como "item pendente", não "vencido"
  const dia = inicioDoDia(agora, timezone);
  const v = new Date(validade);
  if (isNaN(v.getTime())) return false;
  // Compara apenas a data (validade < dia corrente).
  const vDia = inicioDoDia(v, timezone);
  return vDia.getTime() < dia.getTime();
}

const naoVazio = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0;

export function calcularIntegridade(
  inspecao: Inspecao,
  itens: ItemChecklist[],
  opts: IntegridadeOpts = {}
): IntegridadeReport {
  const agora = opts.agora ?? new Date();
  const timezone = opts.timezone ?? BUSINESS_TIMEZONE;

  const respostas: RespostaItem[] = inspecao.respostas || [];
  const respostaPorItem = new Map<string, RespostaItem>();
  for (const r of respostas) respostaPorItem.set(r.itemId, r);

  const obrigatorios = itens.filter((it) => it.obrigatorio);

  const itensObrigatoriosPendentes: IntegridadeReport['itensObrigatoriosPendentes'] = [];
  const evidenciasFaltantes: IntegridadeReport['evidenciasFaltantes'] = [];
  const certificadosVencidos: IntegridadeReport['certificadosVencidos'] = [];

  let respondidos = 0;

  for (const item of obrigatorios) {
    const r = respostaPorItem.get(item.id);
    let satisfeito = false;

    switch (item.tipo) {
      case 'CERTIFICADO': {
        const temCert = r && naoVazio(r.certificadoId) && naoVazio(r.certificadoValidade);
        if (temCert && certificadoVencido(r.certificadoValidade, agora, timezone)) {
          certificadosVencidos.push({ itemId: item.id, descricao: item.descricao });
          satisfeito = false;
        } else {
          satisfeito = !!temCert;
        }
        break;
      }
      case 'MEDICAO': {
        satisfeito = r != null && r.valorNumerico !== null && r.valorNumerico !== undefined;
        break;
      }
      case 'TEXTO': {
        satisfeito = r != null && naoVazio(r.valorTexto);
        break;
      }
      case 'STATUS':
      default: {
        if (!r || r.status == null) {
          satisfeito = false;
        } else if (r.status === 'NAO_APLICAVEL') {
          // N/A exige justificativa em observacao.
          satisfeito = naoVazio(r.observacao);
        } else if (r.status === 'PENDENTE') {
          // PENDENTE é "respondido", mas só satisfaz se a pendência foi
          // resolvida em campo com evidência (foto OU vídeo da resolução).
          const temEvidencia = naoVazio(r.fotoResolvidaUrl) || naoVazio(r.videoUrl);
          const resolvida = r.pendenciaResolvida === true && temEvidencia;
          satisfeito = resolvida;
          if (!resolvida) {
            evidenciasFaltantes.push({
              itemId: item.id,
              descricao: item.descricao,
              motivo: 'Pendência sem evidência de resolução (foto/vídeo).',
            });
          }
        } else {
          // OK
          satisfeito = true;
        }
        break;
      }
    }

    if (satisfeito) {
      respondidos += 1;
    } else {
      // Não duplica na lista de pendentes os itens já contabilizados em
      // evidências/certificados (eles têm seu próprio bucket de exibição).
      const jaListadoEvidencia = evidenciasFaltantes.some((e) => e.itemId === item.id);
      const jaListadoCert = certificadosVencidos.some((c) => c.itemId === item.id);
      if (!jaListadoEvidencia && !jaListadoCert) {
        itensObrigatoriosPendentes.push({
          itemId: item.id,
          secao: item.secao,
          descricao: item.descricao,
        });
      }
    }
  }

  const totalItens = obrigatorios.length;
  const completude = totalItens === 0 ? 100 : Math.round((respondidos / totalItens) * 100);

  const temAssinatura = naoVazio(inspecao.assinaturaUrl);
  const fotos: string[] = inspecao.fotosUrls || [];
  const temFotosOuVideoEquipamento = fotos.some((u) => naoVazio(u)) || naoVazio(inspecao.videoUrl);

  const aprovado =
    itensObrigatoriosPendentes.length === 0 &&
    evidenciasFaltantes.length === 0 &&
    certificadosVencidos.length === 0 &&
    temAssinatura &&
    temFotosOuVideoEquipamento;

  return {
    completude,
    totalItens,
    itensRespondidos: respondidos,
    itensObrigatoriosPendentes,
    evidenciasFaltantes,
    certificadosVencidos,
    temAssinatura,
    temFotosOuVideoEquipamento,
    aprovado,
  };
}
