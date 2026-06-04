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
  PlusCircle,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { Card, Badge, Button } from '@cme/ui';
import api from '../services/api';
import { Inspecao, Equipamento } from '@cme/types';
import { generateInspectionPDF } from '../utils/pdfGenerator';
import { exportInspectionsToExcel, exportSingleInspectionToExcel } from '../utils/excelExporter';

function formatMetric(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('pt-BR') : '0';
}

interface MetricCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  isAlert?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon: Icon, isAlert = false }) => {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon size={18} className="text-slate-400" />
      </div>
      <p className={`mt-3 text-3xl font-bold ${isAlert ? 'text-amber-600' : 'text-slate-900'}`}>
        {formatMetric(value)}
      </p>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [inspecoes, setInspecoes] = useState<Inspecao[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    // Carregar dados de inspeções e equipamentos
    api.inspecoes.list().then(data => setInspecoes(data));
    api.equipamentos.list().then(data => setEquipamentos(data));
  }, []);

  // KPIs calculations
  const totalInspecoes = inspecoes.length;
  
  // Equipamentos "Com Pendências" de acordo com o último checklist
  const getStatusEquipamento = (eqId: string): 'LIBERADO' | 'COM_PENDENCIAS' | 'SEM_INSPECAO' => {
    const eqInspecoes = inspecoes.filter(i => i.equipamentoId === eqId);
    if (eqInspecoes.length === 0) return 'SEM_INSPECAO';
    
    // Mais recente primeiro
    const sorted = [...eqInspecoes].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    const maisRecente = sorted[0];
    
    const temPendenciasNaoResolvidas = maisRecente.respostas.some(
      r => r.status === 'PENDENTE' && r.pendenciaResolvida !== true
    );
    
    return temPendenciasNaoResolvidas ? 'COM_PENDENCIAS' : 'LIBERADO';
  };

  const eqComPendenciasCount = equipamentos.filter(eq => getStatusEquipamento(eq.id) === 'COM_PENDENCIAS').length;
  const eqLiberadosCount = equipamentos.filter(eq => getStatusEquipamento(eq.id) === 'LIBERADO').length;

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
      // Inspecao tem respostas pendentes nao resolvidas
      return matchesSearch && insp.respostas.some(r => r.status === 'PENDENTE' && r.pendenciaResolvida !== true);
    }
    return matchesSearch && insp.status === statusFilter;
  });

  const handleExportAllExcel = () => {
    if (inspecoes.length === 0) return;
    exportInspectionsToExcel(inspecoes);
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Panel */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Painel de Gestão CME
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhe o status operacional das inspeções, pendências críticas e consumo de materiais.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button 
              variant="secondary" 
              onClick={handleExportAllExcel}
              className="flex items-center gap-2 bg-white text-gray-800 border border-gray-200 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>Exportar Tudo (Excel)</span>
            </Button>
            <a
              href="http://localhost:5173" // Links directly to apps/mobile locally
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700">
                <PlusCircle className="h-4 w-4" />
                <span>Nova Inspeção (Campo)</span>
              </Button>
            </a>
          </div>
        </div>
      </Card>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard 
          title="Total de Inspeções" 
          value={totalInspecoes} 
          icon={TrendingUp} 
        />
        <MetricCard 
          title="Equipamentos com Pendência" 
          value={eqComPendenciasCount} 
          icon={AlertTriangle} 
          isAlert={true} 
        />
        <MetricCard 
          title="Equipamentos Liberados" 
          value={eqLiberadosCount} 
          icon={CheckCircle} 
        />
        <MetricCard 
          title="Materiais Utilizados" 
          value={totalMateriaisUtilizados} 
          icon={Wrench} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet Status List (Fleet Intellect) */}
        <div className="lg:col-span-1 space-y-6">
          <Card title="Status Operacional da Frota" subtitle="Inteligência baseada no último checklist preenchido">
            <div className="space-y-4">
              {equipamentos.map(eq => {
                const status = getStatusEquipamento(eq.id);
                return (
                  <div key={eq.id} className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <div>
                      <span className="font-bold text-slate-800 text-sm block">{eq.codigo}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{eq.nome}</span>
                    </div>
                    <div>
                      {status === 'LIBERADO' && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Liberado
                        </span>
                      )}
                      {status === 'COM_PENDENCIAS' && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">
                          Bloqueado / Pendência
                        </span>
                      )}
                      {status === 'SEM_INSPECAO' && (
                        <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Sem Inspeção
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Inspections List */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            {/* Filter Bar */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 md:space-x-4 bg-slate-50/50">
              <div className="relative flex-1 max-w-md">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por equipamento ou responsável..."
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold select-none border transition-colors ${
                    statusFilter === 'ALL'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setStatusFilter('VALIDADA')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold select-none border transition-colors ${
                    statusFilter === 'VALIDADA'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Validados
                </button>
                <button
                  onClick={() => setStatusFilter('EM_ANDAMENTO')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold select-none border transition-colors ${
                    statusFilter === 'EM_ANDAMENTO'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Em Andamento
                </button>
                <button
                  onClick={() => setStatusFilter('PENDENTE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold select-none border transition-colors ${
                    statusFilter === 'PENDENTE'
                      ? 'bg-amber-500 border-amber-500 text-slate-950'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Pendências Ativas
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
                <table className="min-w-full divide-y divide-slate-100 text-left">
                  <thead className="bg-slate-50/50 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Equipamento</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Data / Hora</th>
                      <th className="px-6 py-4">Responsável</th>
                      <th className="px-6 py-4">Localização</th>
                      <th className="px-6 py-4">Pendências</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredInspecoes.map((insp) => {
                      const totalItens = insp.respostas.length;
                      const pendentesNaoResolvidas = insp.respostas.filter(
                        r => r.status === 'PENDENTE' && r.pendenciaResolvida !== true
                      ).length;

                      return (
                        <tr key={insp.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <span className="font-bold text-slate-850">{insp.equipamento?.codigo}</span>
                              <span className="block text-[11px] text-slate-400 mt-0.5">{insp.equipamento?.nome}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-slate-650">
                            {insp.tipo === 'PRE_EMBARQUE' && 'Pré-Embarque'}
                            {insp.tipo === 'OPERACIONAL' && 'Operacional'}
                            {insp.tipo === 'RETORNO_EMBARQUE' && 'Retorno'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                            {new Date(insp.data).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-slate-700 font-medium">
                            {insp.responsavelGeral || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                            {insp.localizacao || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1.5">
                              {pendentesNaoResolvidas > 0 ? (
                                <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {pendentesNaoResolvidas} pendente{pendentesNaoResolvidas > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  Nenhuma
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
                              className="hover:text-blue-600 hover:bg-slate-50"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => generateInspectionPDF(insp)}
                              className="hover:text-red-600 hover:bg-slate-50"
                              title="Baixar PDF"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => exportSingleInspectionToExcel(insp)}
                              className="hover:text-green-600 hover:bg-slate-50"
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
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
