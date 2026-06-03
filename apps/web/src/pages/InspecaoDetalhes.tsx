import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, FileText, CheckCircle2, User, AlertTriangle } from 'lucide-react';
import { Card, Badge, Button } from '@cme/ui';
import api from '../services/api';
import { Inspecao } from '@cme/types';
import { generateInspectionPDF } from '../utils/pdfGenerator';
import { exportSingleInspectionToExcel } from '../utils/excelExporter';

export const InspecaoDetalhes: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspecao, setInspecao] = useState<Inspecao | null>(null);
  const [userRole, setUserRole] = useState<string>('Operador');

  useEffect(() => {
    if (id) {
      api.inspecoes.get(id).then(data => {
        if (data) setInspecao(data);
      });
    }
    const user = api.auth.currentUser();
    if (user && user.funcao) {
      setUserRole(user.funcao);
    }
  }, [id]);

  if (!inspecao) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <span className="text-3xl">⚠️</span>
        <p className="text-slate-500 font-bold uppercase tracking-wider mt-4">Inspeção não encontrada</p>
        <Button onClick={() => navigate('/')} className="mt-6">Voltar ao Painel</Button>
      </div>
    );
  }

  // Agrupar itens por seção para exibição estruturada
  const secoes: Record<string, typeof inspecao.respostas> = {};
  inspecao.respostas.forEach(resp => {
    const secName = resp.item?.secao || 'GERAL';
    if (!secoes[secName]) secoes[secName] = [];
    secoes[secName].push(resp);
  });

  const handleValidate = async () => {
    const updated: Inspecao = {
      ...inspecao,
      status: 'VALIDADA'
    };
    await api.inspecoes.save(updated);
    setInspecao(updated);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back Button & Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-slate-500 hover:text-slate-800 transition-colors text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar ao Painel</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => generateInspectionPDF(inspecao)}
            className="flex items-center space-x-2"
          >
            <FileText className="h-4 w-4 text-rose-600" />
            <span>Baixar PDF</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => exportSingleInspectionToExcel(inspecao)}
            className="flex items-center space-x-2"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Exportar Excel</span>
          </Button>

          {inspecao.status !== 'VALIDADA' && userRole === 'Supervisor' && (
            <Button
              variant="success"
              onClick={handleValidate}
              className="flex items-center space-x-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Validar Inspeção</span>
            </Button>
          )}
        </div>
      </div>

      {/* Overview Card */}
      <Card 
        title={`Inspeção: ${inspecao.equipamento?.codigo} - ${inspecao.equipamento?.nome}`}
        subtitle={`Registro ID: ${inspecao.id}`}
        headerAction={<Badge type={inspecao.status} />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Tipo de Inspeção</span>
            <span className="text-slate-700 dark:text-slate-300 text-sm font-bold block mt-1">
              {inspecao.tipo.replace('_', ' ')}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Data e Hora</span>
            <span className="text-slate-700 dark:text-slate-300 text-sm font-bold block mt-1">
              {new Date(inspecao.data).toLocaleString('pt-BR')}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Responsável Geral</span>
            <span className="text-slate-700 dark:text-slate-300 text-sm font-bold block mt-1">
              {inspecao.responsavelGeral || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Localização / Base</span>
            <span className="text-slate-700 dark:text-slate-300 text-sm font-bold block mt-1">
              {inspecao.localizacao || 'N/A'}
            </span>
          </div>
        </div>
      </Card>

      {/* Main Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Checklist Items Responses */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Respostas do Checklist</h2>
          {Object.entries(secoes).map(([secName, respostas]) => (
            <Card key={secName} title={secName}>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {respostas.map(resp => (
                  <div key={resp.id} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <p className="text-slate-700 dark:text-slate-200 font-medium">
                        {resp.item?.descricao}
                      </p>
                      {(resp.observacao || resp.responsavel) && (
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {resp.observacao && (
                            <span className="text-xs text-slate-500 bg-slate-50 border px-2 py-0.5 rounded flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                              Obs: {resp.observacao}
                            </span>
                          )}
                          {resp.responsavel && (
                            <span className="text-xs text-slate-500 bg-indigo-50/50 border border-indigo-100 px-2 py-0.5 rounded flex items-center gap-1">
                              <User className="h-3 w-3 text-indigo-500" />
                              Executante: {resp.responsavel}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <Badge type={resp.status} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Right Column: Consumed Materials & Digital Signature */}
        <div className="space-y-6">
          
          {/* Materials Consumed Card */}
          <Card title="Materiais Utilizados">
            {inspecao.materiais.length === 0 ? (
              <p className="text-slate-400 text-xs py-4 text-center">Nenhum material utilizado nesta inspeção.</p>
            ) : (
              <div className="space-y-3">
                {inspecao.materiais.map(mat => (
                  <div key={mat.id} className="flex justify-between items-start text-xs border-b border-slate-100 pb-2">
                    <div>
                      <span className="font-bold text-slate-700 block">{mat.material?.descricao}</span>
                      <span className="text-slate-400 text-[10px] block mt-0.5">SKU: {mat.material?.codigo}</span>
                      {mat.observacao && <span className="text-[10px] text-amber-600 block mt-0.5">Nota: {mat.observacao}</span>}
                    </div>
                    <span className="bg-slate-100 px-2.5 py-1 rounded font-bold text-slate-700">
                      {mat.quantidade} {mat.material?.unidade}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Observations Card */}
          <Card title="Observações Gerais">
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/50 border p-3 rounded-lg">
              {inspecao.observacoesGerais || 'Sem observações adicionais.'}
            </p>
          </Card>

          {/* Inspector Signature Box */}
          <Card title="Assinatura Digital Encerramento">
            {inspecao.assinaturaBase64 ? (
              <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 flex items-center justify-center h-24">
                <img 
                  src={inspecao.assinaturaBase64} 
                  alt="Assinatura do Inspetor" 
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="border border-dashed border-slate-200 rounded-lg p-4 bg-slate-50/20 text-center text-xs text-slate-400">
                Assinatura não cadastrada.
              </div>
            )}
          </Card>
        </div>

      </div>
    </div>
  );
};
export default InspecaoDetalhes;
