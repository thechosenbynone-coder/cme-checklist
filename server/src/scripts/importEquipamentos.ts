// Importa equipamentos da planilha LOCALIZAÇÃO_EQUIPAMENTOS para o Neon.
// Uso:
//   npx tsx src/scripts/importEquipamentos.ts --dry-run   (preview, sem DB)
//   npx tsx src/scripts/importEquipamentos.ts             (importa de fato)
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { parseWorkbook } from '../equipamentos/parsePlanilha.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/scripts -> server/
const PLANILHA = path.resolve(__dirname, '../../LOCALIZAÇÃO_EQUIPAMENTOS_REV. 11-06-26.xlsx');

const dryRun = process.argv.includes('--dry-run');

function statusLiberacaoInicial(validadeISO: string | null): string {
  // Sem checklist validado => PENDENTE; certificado vencido => VENCIDO.
  if (validadeISO) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (validadeISO < hoje) return 'VENCIDO';
  }
  return 'PENDENTE';
}

async function main() {
  const planilha = process.env.PLANILHA_EQUIPAMENTOS || PLANILHA;
  console.log(`📄 Lendo planilha: ${planilha}`);
  const { equipamentos, duplicados, porAba } = parseWorkbook(planilha);

  console.log('\n=== Resumo por aba (GERAL ignorada) ===');
  for (const [aba, n] of Object.entries(porAba)) {
    console.log(`  ${aba.padEnd(24)} ${n}`);
  }
  console.log(`  TOTAL (após dedupe): ${equipamentos.length}`);
  if (duplicados.length) {
    console.log(`  ⚠️ Códigos duplicados ignorados: ${[...new Set(duplicados)].join(', ')}`);
  }

  console.log('\n=== Amostra (3) ===');
  for (const e of equipamentos.slice(0, 3)) {
    console.log(
      `  ${e.codigo} | exib=${e.codigoExibicao} | busca=${e.chaveBusca} | tipo=${e.tipo} | local=${e.localizacaoAtual} | valid=${e.validadeCertificado} | certs=${e.certificados.length}`
    );
  }

  if (dryRun) {
    console.log('\n🔎 DRY-RUN: nada foi gravado no banco.');
    return;
  }

  const prisma = new PrismaClient();
  let criados = 0;
  let atualizados = 0;
  try {
    for (const e of equipamentos) {
      const validade = e.validadeCertificado ? new Date(e.validadeCertificado) : null;
      const existente = await prisma.equipamento.findUnique({ where: { codigo: e.codigo } });

      const eq = await prisma.equipamento.upsert({
        where: { codigo: e.codigo },
        create: {
          codigo: e.codigo,
          codigoExibicao: e.codigoExibicao,
          chaveBusca: e.chaveBusca,
          nome: e.nome,
          tipo: e.tipo,
          localizacao: e.localizacaoAtual,
          localizacaoAtual: e.localizacaoAtual,
          status: 'Ativo',
          statusLiberacao: statusLiberacaoInicial(e.validadeCertificado),
          validadeCertificado: validade,
          dadosPlanilha: e.dadosPlanilha as any,
          syncStatus: 'IMPORTADO',
        },
        update: {
          codigoExibicao: e.codigoExibicao,
          chaveBusca: e.chaveBusca,
          nome: e.nome,
          tipo: e.tipo,
          localizacaoAtual: e.localizacaoAtual,
          validadeCertificado: validade,
          dadosPlanilha: e.dadosPlanilha as any,
          syncStatus: 'IMPORTADO',
        },
      });
      existente ? atualizados++ : criados++;

      // Recria os certificados derivados da planilha (idempotente).
      await prisma.certificado.deleteMany({ where: { equipamentoId: eq.id } });
      if (e.certificados.length) {
        await prisma.certificado.createMany({
          data: e.certificados.map((c) => ({
            equipamentoId: eq.id,
            tipo: c.tipo,
            numero: c.numero || null,
            validade: c.validade ? new Date(c.validade) : null,
          })),
        });
      }
    }
    console.log(`\n✅ Importação concluída: ${criados} criados, ${atualizados} atualizados.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Erro na importação:', e);
  process.exit(1);
});
