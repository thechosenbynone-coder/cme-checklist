import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Inspecao } from '@cme/types';

// Extend jsPDF interface to include autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

export const generateInspectionPDF = (inspecao: Inspecao): void => {
  const doc = new jsPDF() as jsPDFWithAutoTable;
  
  // Cores institucionais
  const primaryColor = [27, 35, 48]; // #1b2330 (navy)
  const successColor = [16, 185, 129]; // #10b981 (emerald)
  const dangerColor = [239, 68, 68]; // #ef4444 (red)
  const grayColor = [100, 116, 139]; // #64748b (slate)

  // 1. Cabeçalho Principal (Borda e Título)
  doc.rect(10, 10, 190, 25);
  doc.line(75, 10, 75, 35);
  doc.line(145, 10, 145, 35);
  
  // Título e logo simulado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CONTINENTAL', 15, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('OIL & GAS SERVICES', 15, 23);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CHECK LIST OPERACIONAL DE LIBERACAO', 77, 18);
  doc.text('DE EQUIPAMENTO', 77, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('CHECK LIST OPERACIONAL AFTER COOLER', 77, 29);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Cód: OPE-PC-03 ANEXO 2-A', 148, 16);
  doc.text(`Revisão: 00`, 148, 22);
  doc.text(`Data: ${new Date(inspecao.data).toLocaleDateString('pt-BR')}`, 148, 28);
  doc.text(`Status: ${inspecao.status}`, 148, 33);

  // 2. Bloco de Dados do Equipamento
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setFillColor(244, 246, 248);
  doc.rect(10, 40, 190, 38, 'F');
  doc.rect(10, 40, 190, 38);

  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DA INSPEÇÃO', 14, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Equipamento: ${inspecao.equipamento?.nome || 'N/A'} (${inspecao.equipamento?.codigo || 'N/A'})`, 14, 53);
  doc.text(`Tipo de Inspeção: ${inspecao.tipo.replace('_', ' ')}`, 14, 59);
  doc.text(`Responsável Geral: ${inspecao.responsavelGeral || 'Não informado'}`, 14, 65);
  doc.text(`Origem: ${inspecao.origem || 'Não informado'}`, 14, 71);
  
  doc.text(`Data da Inspeção: ${new Date(inspecao.data).toLocaleString('pt-BR')}`, 110, 53);
  doc.text(`Localização/Base: ${inspecao.localizacao || 'Não informado'}`, 110, 59);
  doc.text(`Destino: ${inspecao.destino || 'Não informado'}`, 110, 65);
  
  let currentY = 84;

  // 3. Tabela de Respostas do Checklist
  const itemRows = inspecao.respostas.map((resp) => {
    let statusText = 'N/A';
    if (resp.status === 'OK') statusText = 'APROVADO';
    if (resp.status === 'PENDENTE') statusText = 'REPROVADO';

    let descText = resp.item?.descricao || 'Sem descrição';
    if (resp.certificadoId || resp.certificadoValidade) {
      const certParts = [];
      if (resp.certificadoId) certParts.push(`ID: ${resp.certificadoId}`);
      if (resp.certificadoValidade) certParts.push(`VAL: ${resp.certificadoValidade}`);
      descText += `\n(${certParts.join(' / ')})`;
    }

    return [
      resp.item?.secao || 'GERAL',
      descText,
      statusText,
      resp.observacao || '',
      resp.responsavel || ''
    ];
  });

  doc.autoTable({
    startY: currentY,
    head: [['Seção', 'Item de Inspeção', 'Status', 'Observações', 'Executante']],
    body: itemRows,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [50, 50, 50]
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 70 },
      2: { cellWidth: 22, fontStyle: 'bold', halign: 'center' },
      3: { cellWidth: 38 },
      4: { cellWidth: 20 }
    },
    didParseCell: (data: any) => {
      // Colorir a coluna do status
      if (data.column.index === 2 && data.section === 'body') {
        const val = data.cell.raw;
        if (val === 'APROVADO') {
          data.cell.styles.textColor = successColor;
        } else if (val === 'REPROVADO') {
          data.cell.styles.textColor = dangerColor;
        } else {
          data.cell.styles.textColor = grayColor;
        }
      }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // 4. Materiais Consumidos
  if (inspecao.materiais && inspecao.materiais.length > 0) {
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('MATERIAIS CONSUMIDOS / UTILIZADOS', 10, currentY);
    currentY += 4;

    const materialRows = inspecao.materiais.map(mat => [
      mat.material?.codigo || 'N/A',
      mat.material?.descricao || 'N/A',
      `${mat.quantidade} ${mat.material?.unidade || 'UN'}`,
      mat.observacao || ''
    ]);

    doc.autoTable({
      startY: currentY,
      head: [['Código SKU', 'Descrição do Material', 'Quantidade', 'Observações']],
      body: materialRows,
      theme: 'grid',
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 90 },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 45 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // 5. Observações Gerais
  if (inspecao.observacoesGerais) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('OBSERVAÇÕES GERAIS', 10, currentY);
    currentY += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const splitText = doc.splitTextToSize(inspecao.observacoesGerais, 190);
    doc.text(splitText, 10, currentY);
    currentY += splitText.length * 5 + 10;
  }

  // 6. Bloco de Assinatura
  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  doc.line(10, currentY + 25, 100, currentY + 25);
  doc.line(110, currentY + 25, 200, currentY + 25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Assinatura do Inspetor / Responsável', 14, currentY + 30);
  doc.text(inspecao.responsavelGeral || 'Operador de Campo', 14, currentY + 34);

  doc.text('Assinatura do Supervisor / Validador', 114, currentY + 30);
  doc.text('Continental Oil & Gas Services', 114, currentY + 34);

  // Inserir imagem de assinatura se houver
  if (inspecao.assinaturaBase64) {
    try {
      doc.addImage(inspecao.assinaturaBase64, 'PNG', 20, currentY + 2, 60, 20);
    } catch (e) {
      console.error('Erro ao renderizar imagem da assinatura no PDF', e);
    }
  }

  // Baixar documento
  const fileName = `Checklist_${inspecao.equipamento?.codigo || 'Equipamento'}_${new Date(inspecao.data).toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};
