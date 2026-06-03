import * as XLSX from 'xlsx';
import { Inspecao } from '@cme/types';

export const exportInspectionsToExcel = (inspecoes: Inspecao[]): void => {
  // 1. Flatten inspections list for Excel rows
  const rows = inspecoes.map(insp => {
    // Contagem de status
    const okCount = insp.respostas.filter(r => r.status === 'OK').length;
    const pendingCount = insp.respostas.filter(r => r.status === 'PENDENTE').length;
    const naCount = insp.respostas.filter(r => r.status === 'NAO_APLICAVEL').length;
    
    // Contagem de materiais
    const materialQuantity = insp.materiais.reduce((acc, m) => acc + m.quantidade, 0);

    return {
      'ID Inspeção': insp.id,
      'Equipamento': insp.equipamento?.codigo || 'N/A',
      'Nome Equipamento': insp.equipamento?.nome || 'N/A',
      'Tipo de Equipamento': insp.equipamento?.tipo || 'N/A',
      'Tipo de Inspeção': insp.tipo.replace('_', ' '),
      'Data / Hora': new Date(insp.data).toLocaleString('pt-BR'),
      'Status Geral': insp.status,
      'Responsável': insp.responsavelGeral || 'N/A',
      'Localização': insp.localizacao || 'N/A',
      'Itens OK': okCount,
      'Itens Pendentes': pendingCount,
      'Itens N/A': naCount,
      'Total Itens': insp.respostas.length,
      'Materiais Utilizados (Qtd)': materialQuantity,
      'Observações Gerais': insp.observacoesGerais || ''
    };
  });

  // Criar planilha do Excel
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inspeções');

  // Ajustar largura das colunas automaticamente
  const maxProps = Object.keys(rows[0] || {});
  const wscols = maxProps.map(prop => {
    let maxLength = prop.length;
    rows.forEach((row: any) => {
      const val = row[prop];
      if (val !== undefined && val !== null) {
        maxLength = Math.max(maxLength, val.toString().length);
      }
    });
    return { wch: maxLength + 3 };
  });
  worksheet['!cols'] = wscols;

  // Gerar e baixar arquivo
  XLSX.writeFile(workbook, `Relatorio_Inspecoes_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportSingleInspectionToExcel = (inspecao: Inspecao): void => {
  const workbook = XLSX.utils.book_new();

  // Aba 1: Resumo da Inspeção
  const resumo = [
    { Campo: 'ID Inspeção', Valor: inspecao.id },
    { Campo: 'Equipamento Código', Valor: inspecao.equipamento?.codigo || 'N/A' },
    { Campo: 'Equipamento Nome', Valor: inspecao.equipamento?.nome || 'N/A' },
    { Campo: 'Tipo de Inspeção', Valor: inspecao.tipo.replace('_', ' ') },
    { Campo: 'Data da Inspeção', Valor: new Date(inspecao.data).toLocaleString('pt-BR') },
    { Campo: 'Status da Inspeção', Valor: inspecao.status },
    { Campo: 'Responsável Geral', Valor: inspecao.responsavelGeral || 'N/A' },
    { Campo: 'Localização', Valor: inspecao.localizacao || 'N/A' },
    { Campo: 'Observações Gerais', Valor: inspecao.observacoesGerais || '' }
  ];
  const wsResumo = XLSX.utils.json_to_sheet(resumo);
  XLSX.utils.book_append_sheet(workbook, wsResumo, 'Resumo');

  // Aba 2: Itens do Checklist
  const itens = inspecao.respostas.map(resp => ({
    'Ordem': resp.item?.ordem || 0,
    'Seção': resp.item?.secao || 'N/A',
    'Descrição do Item': resp.item?.descricao || 'N/A',
    'Status': resp.status,
    'Observação do Item': resp.observacao || '',
    'Responsável Específico': resp.responsavel || ''
  }));
  const wsItens = XLSX.utils.json_to_sheet(itens);
  XLSX.utils.book_append_sheet(workbook, wsItens, 'Checklist');

  // Aba 3: Materiais Utilizados
  const materiais = inspecao.materiais.map(mat => ({
    'Código SKU': mat.material?.codigo || 'N/A',
    'Descrição do Material': mat.material?.descricao || 'N/A',
    'Unidade': mat.material?.unidade || 'UN',
    'Quantidade': mat.quantidade,
    'Observações': mat.observacao || ''
  }));
  const wsMateriais = XLSX.utils.json_to_sheet(materiais);
  XLSX.utils.book_append_sheet(workbook, wsMateriais, 'Materiais Consumidos');

  // Baixar
  const fileName = `Inspecao_${inspecao.equipamento?.codigo || 'Equipamento'}_${new Date(inspecao.data).toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};
