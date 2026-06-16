import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning existing database...');
  await prisma.materialUtilizado.deleteMany();
  await prisma.respostaItem.deleteMany();
  await prisma.inspecao.deleteMany();
  await prisma.itemChecklist.deleteMany();
  await prisma.checklistModelo.deleteMany();
  await prisma.material.deleteMany();
  await prisma.user.deleteMany();
  // Equipamentos NÃO são semeados aqui: vêm da importação da planilha (Fase 1).

  console.log('Seeding Users (usuário de teste)...');
  // Credencial de teste: Lucas Lima / 321 (Gestor). Usuários reais recebem senha própria.
  const senhaHash = await bcrypt.hash('321', 10);
  await prisma.user.create({
    data: {
      id: 'usr-lucas',
      nome: 'Lucas Lima',
      email: 'lucas.lima@cme.local',
      funcao: 'GESTOR',
      senhaHash,
      ativo: true,
    },
  });

  console.log('Seeding ChecklistModelo...');
  const checklistModelo = await prisma.checklistModelo.create({
    data: {
      id: 'mod-1',
      nome: 'Checklist Operacional de Liberação de After Cooler',
      tipoEquipamento: 'After Cooler',
      versao: 1,
      ativo: true,
    }
  });

  console.log('Seeding ItemChecklist...');
  const itens = [
    { id: 'it-1', modeloId: 'mod-1', secao: 'INSPEÇÃO DO CONTAINER E LINGADA', ordem: 1, descricao: 'Verificar validade do certificado do container (ID/VALID)', obrigatorio: true },
    { id: 'it-2', modeloId: 'mod-1', secao: 'INSPEÇÃO DO CONTAINER E LINGADA', ordem: 2, descricao: 'Verificar validade do certificado da lingada (ID/VALID)', obrigatorio: true },
    { id: 'it-3', modeloId: 'mod-1', secao: 'INSPEÇÃO GERAL', ordem: 3, descricao: 'Verificar dessalinização e limpeza do radiador e skid', obrigatorio: true },
    { id: 'it-4', modeloId: 'mod-1', secao: 'INSPEÇÃO GERAL', ordem: 4, descricao: 'Remover objetos soltos dentro do skid', obrigatorio: true },
    { id: 'it-5', modeloId: 'mod-1', secao: 'INSPEÇÃO GERAL', ordem: 5, descricao: 'Inspecionar visualmente o conjunto de içamento (pintura, travamento das manilhas com contra-pinos, lubrificação e danos dos cabos de aço) - substituir caso necessário', obrigatorio: true },
    { id: 'it-6', modeloId: 'mod-1', secao: 'INSPEÇÃO GERAL', ordem: 6, descricao: 'Conferir se todos os manômetros e vasos de pressão estão íntegros e identificados com adesivos de certificação e NR13', obrigatorio: true },
    { id: 'it-7', modeloId: 'mod-1', secao: 'INSPEÇÃO GERAL', ordem: 7, descricao: 'Inspecionar limpeza, identificação e danos físicos ao Skid (interno e externo), incluindo porcas, parafusos e travões', obrigatorio: true },
    { id: 'it-8', modeloId: 'mod-1', secao: 'INSPEÇÃO GERAL', ordem: 8, descricao: 'Conferir fechamento total dos painéis elétricos, verificar se faltam parafusos, adesivos de "440 VOLTS" e "PERIGO PAINEL ELÉTRICO", verificação visual de dano ao cabo elétrico de alimentação e prensa cabos', obrigatorio: true },
    { id: 'it-9', modeloId: 'mod-1', secao: 'INSPEÇÃO GERAL', ordem: 9, descricao: 'Verificar etiqueta externa de status do equipamento (laranja/verde/vermelha)', obrigatorio: true },
    { id: 'it-10', modeloId: 'mod-1', secao: 'INSPEÇÃO GERAL', ordem: 10, descricao: 'Verificar danos no radiador', obrigatorio: true },
    { id: 'it-11', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (DESPRESSURIZADO)', ordem: 11, descricao: 'Verificar certificação da válvula de segurança (PSV) (ID/VALID)', obrigatorio: true },
    { id: 'it-12', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (DESPRESSURIZADO)', ordem: 12, descricao: 'Verificar certificação do manômetro (VALID)', obrigatorio: true },
    { id: 'it-13', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (DESPRESSURIZADO)', ordem: 13, descricao: 'Verificar certificação NR13 dos reservatórios de ar (ID/VALID)', obrigatorio: true },
    { id: 'it-14', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (DESPRESSURIZADO)', ordem: 14, descricao: 'Inspecionar filtros coalescentes, confirmar sequência FEP, FEO, FEOA', obrigatorio: true },
    { id: 'it-15', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (DESPRESSURIZADO)', ordem: 15, descricao: 'Inspecionar rolamento (graxa dos mancais) e correias do ventilador', obrigatorio: true },
    { id: 'it-16', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA ELÉTRICO', ordem: 16, descricao: 'Abrir o painel e verificar reaperto de todos os componentes', obrigatorio: true },
    { id: 'it-17', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA ELÉTRICO', ordem: 17, descricao: 'Verificar cabos e prensa cabos na entrada do painel elétrico, motor e luminária (em caso de danos substituir)', obrigatorio: true },
    { id: 'it-18', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA ELÉTRICO', ordem: 18, descricao: 'Verificar funcionamento do sistema 440 VCA e megar motor', obrigatorio: true },
    { id: 'it-19', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA ELÉTRICO', ordem: 19, descricao: 'Verificar amperagem nas 3 fases do motor elétrico (em funcionamento)', obrigatorio: true },
    { id: 'it-20', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA ELÉTRICO', ordem: 20, descricao: 'Verificar funcionamento da iluminação', obrigatorio: true },
    { id: 'it-21', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (PRESSURIZADO)', ordem: 21, descricao: 'Verificar se a válvula de controle de pressão (PRV) está regulada para 10 bar e testar estanqueidade', obrigatorio: true },
    { id: 'it-22', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (PRESSURIZADO)', ordem: 22, descricao: 'Verificar se as válvulas manuais do manifold de entrada de ar comprimido estão funcionando corretamente e se as conexões Hammer estão íntegras e com anéis de vedação', obrigatorio: true },
    { id: 'it-23', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (PRESSURIZADO)', ordem: 23, descricao: 'Drenar água dos reservatórios de ar e drenos, verificar mangotes e funcionamento das válvulas', obrigatorio: true },
    { id: 'it-24', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (PRESSURIZADO)', ordem: 24, descricao: 'Verificar se existem vazamentos nos flanges e tubulações', obrigatorio: true },
    { id: 'it-25', modeloId: 'mod-1', secao: 'INSPEÇÃO DO SISTEMA PNEUMÁTICO (PRESSURIZADO)', ordem: 25, descricao: 'Verificar se existem vazamentos na colmeia do radiador', obrigatorio: true },
    { id: 'it-26', modeloId: 'mod-1', secao: 'TESTE OPERACIONAL DO SISTEMA', ordem: 26, descricao: 'Temperatura no manifold de entrada de ar comprimido (Celsius)', obrigatorio: false },
    { id: 'it-27', modeloId: 'mod-1', secao: 'TESTE OPERACIONAL DO SISTEMA', ordem: 27, descricao: 'Temperatura no manifold de saída de ar comprimido (Celsius)', obrigatorio: false },
  ];
  for (const it of itens) {
    await prisma.itemChecklist.create({ data: it });
  }

  console.log('Seeding Materiais...');
  const materiais = [
    { id: 'mat-1', codigo: 'AFT-F01', descricao: 'Filtro Coalescente Primário 40 Microns de Metal', unidade: 'UN', categoria: 'Filtros', ativo: true },
    { id: 'mat-2', codigo: 'AFT-F02', descricao: 'Filtro Coalescente Secundário 1 Microns', unidade: 'UN', categoria: 'Filtros', ativo: true },
    { id: 'mat-3', codigo: 'AFT-F03', descricao: 'Filtro Coalescente Secundário 0.1 Microns', unidade: 'UN', categoria: 'Filtros', ativo: true },
    { id: 'mat-4', codigo: 'MEQ-001', descricao: 'Quadro Elétrico EX Modelo (TELBRA TMX-35R)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-5', codigo: 'MEQ-002', descricao: 'Botão de Partida EX Verde (SGEX22GBINVD10)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-6', codigo: 'MEQ-003', descricao: 'Chave Seletora EX ON-OFF (SGEX22GADA1NASRS100B2)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-7', codigo: 'MEQ-004', descricao: 'Botão de Parada EX Vermelha (SGEX22GBINVM01)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-8', codigo: 'MEQ-005', descricao: 'Indicador Luminoso EX Verde (SGEX22GPINVDLVD04)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-9', codigo: 'MEQ-006', descricao: 'Indicador Luminoso EX Vermelho (SGEX22GPINVMLVM04)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-10', codigo: 'MEQ-007', descricao: 'Botão de Rearme EX (SGEX22GBRNPR100)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-11', codigo: 'MEQ-008', descricao: 'Disjuntor Tripolar 63 Amps (WEG DWB160B)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-12', codigo: 'MEQ-009', descricao: 'Disjuntor Bipolar C2 (WEG MDW C2)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-13', codigo: 'MEQ-010', descricao: 'Transformador de Painel Bifásico 50 VA (440/380/220V x 110/220V)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-14', codigo: 'MEQ-011', descricao: 'Relé Falta de Fase Trifásico 440 V (WEG RMW17-FF)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-15', codigo: 'MEQ-012', descricao: 'Contatora Trifásica 40 Amps Bobina 220 V (WEG CWM40)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
    { id: 'mat-16', codigo: 'MEQ-013', descricao: 'Relé Térmico Trifásico 40 Amps (WEG RW67D)', unidade: 'UN', categoria: 'Elétrica', ativo: true },
  ];
  for (const m of materiais) {
    await prisma.material.create({ data: m });
  }

  console.log('Database seeding complete! ✅');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });