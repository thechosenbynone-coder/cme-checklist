import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileSpreadsheet, 
  FileText, 
  Search, 
  TrendingUp, 
  AlertTriangle, 
  Wrench, 
  CheckCircle,
  ExternalLink,
  PlusCircle
} from 'lucide-react';
import { Card, Badge, Button } from '@cme/ui';
import api from '../services/api';
import { Inspecao } from '@cme/types';
import { generateInspectionPDF } from '../utils/pdfGenerator';
import { exportInspectionsToExcel, exportSingleInspectionToExcel } from '../utils/excelExporter';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [inspecoes, setInspecoes] = useState<Inspecao[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    // Carregar dados de inspeções
    api.inspecoes.list().then(data => setInspecoes(data));
  }, []);

  // KPIs calculations
  const totalInspecoes = inspecoes.length;
  const pendentesCount = inspecoes.filter(
    insp => insp.respostas.some(r => r.status === 'PENDENTE')
  ).length;
  const emAndamentoCount = inspecoes.filter(insp => insp.status === 'EM_ANDAMENTO').length;
  const concluídasCount = inspecoes.filter(insp => insp.status === 'VALIDADA' || insp.status === 'CONCLUIDA').length;

  const totalMateriaisUtilizados = inspecoes.reduce(
    (total, insp) => total + insp.materiais.reduce((mTotal, m) => mTotal + m.quantidade, 0), 
    0
  );

  // Filters application
  const filteredInspecoes = inspecoes.filter(insp => {
    const matchesSearch = 
      (insp.equipamento?.codigo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (insp.equipamento?.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (insp.responsavelGeral || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    if (statusFilter === 'ALL') return matchesSearch;
    if (statusFilter === 'PENDENTE') {
      return matchesSearch && insp.respostas.some(r => r.status === 'PENDENTE');
    }
    return matchesSearch && insp.status === statusFilter;
  });

  const handleExportAllExcel = () => {
    if (inspecoes.length === 0) return;
    exportInspectionsToExcel(inspecoes);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Welcome Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-white leading-none">
            Painel de Gestão CME
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
            Acompanhe o status operacional das inspeções, pendências críticas e consumo de materiais.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button 
            variant="secondary" 
            onClick={handleExportAllExcel}
            className="flex items-center space-x-2"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Exportar Tudo (Excel)</span>
          </Button>
          <a
            href="http://localhost:5173" // Links directly to apps/mobile locally
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="flex items-center space-x-2">
              <PlusCircle className="h-4 w-4" />
              <span>Nova Inspeção (Campo)</span>
            </Button>
          </a>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Total de Inspeções</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-white block mt-2">{totalInspecoes}</span>
            </div>
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Com Pendências</span>
              <span className="text-3xl font-extrabold text-amber-600 block mt-2">{pendentesCount}</span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-500 rounded-xl">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Em Andamento</span>
              <span className="text-3xl font-extrabold text-sky-600 block mt-2">{emAndamentoCount}</span>
            </div>
            <div className="p-3 bg-sky-50 dark:bg-sky-950/20 text-sky-500 rounded-xl">
              <Wrench className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">Materiais Utilizados</span>
              <span className="text-3xl font-extrabold text-emerald-600 block mt-2">{totalMateriaisUtilizados} <span className="text-xs text-slate-400 font-medium">un</span></span>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <CheckCircle className="h-6 w-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Audit List */}
      <div className="bg-white border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {/* Filter Bar */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 md:space-x-4 bg-slate-50/50 dark:bg-slate-950/10">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Buscar por equipamento ou responsável..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl block w-full text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-slate-850 dark:border-slate-700 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold select-none border transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('VALIDADA')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold select-none border transition-colors ${
                statusFilter === 'VALIDADA'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Validados
            </button>
            <button
              onClick={() => setStatusFilter('EM_ANDAMENTO')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold select-none border transition-colors ${
                statusFilter === 'EM_ANDAMENTO'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Em Andamento
            </button>
            <button
              onClick={() => setStatusFilter('PENDENTE')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold select-none border transition-colors ${
                statusFilter === 'PENDENTE'
                  ? 'bg-amber-500 border-amber-500 text-slate-950'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Com Pendência
            </button>
          </div>
        </div>

        {/* Inspections Table */}
        <div className="overflow-x-auto">
          {filteredInspecoes.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-3xl block">📋</span>
              <p className="text-slate-400 text-sm mt-3 font-semibold uppercase tracking-wider">Nenhuma inspeção encontrada</p>
              <p className="text-slate-500 text-xs mt-1">Ajuste os filtros ou crie uma nova inspeção de campo.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50/50 dark:bg-slate-950/20 text-slate-500 text-[10px] font-bold uppercase tracking-wider text-left">
                <tr>
                  <th className="px-6 py-4">Equipamento</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Data / Hora</th>
                  <th className="px-6 py-4">Responsável</th>
                  <th className="px-6 py-4">Localização</th>
                  <th className="px-6 py-4">Itens</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredInspecoes.map((insp) => {
                  // Contagem de pendências
                  const totalItens = insp.respostas.length;
                  const pendentes = insp.respostas.filter(r => r.status === 'PENDENTE').length;

                  return (
                    <tr key={insp.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <span className="font-bold text-slate-800 dark:text-white">{insp.equipamento?.codigo}</span>
                          <span className="block text-[11px] text-slate-400 mt-0.5">{insp.equipamento?.nome}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {insp.tipo === 'PRE_EMBARQUE' && 'Pré-Embarque'}
                        {insp.tipo === 'OPERACIONAL' && 'Operacional'}
                        {insp.tipo === 'RETORNO_EMBARQUE' && 'Retorno'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                        {new Date(insp.data).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-700 dark:text-slate-300 font-medium">
                        {insp.responsavelGeral || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                        {insp.localizacao || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-700 font-semibold">{totalItens}</span>
                          {pendentes > 0 && (
                            <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              {pendentes} pendente{pendentes > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge type={insp.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/inspecoes/${insp.id}`)}
                          className="hover:text-indigo-600 hover:bg-indigo-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => generateInspectionPDF(insp)}
                          className="hover:text-rose-600 hover:bg-rose-50"
                          title="Baixar PDF"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => exportSingleInspectionToExcel(insp)}
                          className="hover:text-emerald-600 hover:bg-emerald-50"
                          title="Exportar Excel"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
