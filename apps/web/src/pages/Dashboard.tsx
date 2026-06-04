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
  ArrowUpRight,
  HelpCircle,
  Activity,
  ChevronDown
} from 'lucide-react';
import { Badge, Button } from '@cme/ui';
import api from '../services/api';
import { Inspecao, Equipamento } from '@cme/types';
import { generateInspectionPDF } from '../utils/pdfGenerator';
import { exportInspectionsToExcel, exportSingleInspectionToExcel } from '../utils/excelExporter';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [inspecoes, setInspecoes] = useState<Inspecao[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeSection, setActiveSection] = useState('Visão Geral');

  useEffect(() => {
    // Carregar dados de inspeções e equipamentos
    api.inspecoes.list().then(data => setInspecoes(data));
    api.equipamentos.list().then(data => setEquipamentos(data));
  }, []);

  const handleNewChecklist = () => {
    const mobileUrl = window.location.port === '5174' 
      ? 'http://localhost:5173' 
      : `${window.location.protocol}//${window.location.hostname}:5173`;
    window.open(mobileUrl, '_blank');
  };

  // KPIs calculations
  const totalInspecoes = inspecoes.length;
  
  // Equipamentos "Com Pendências" de acordo com o último checklist
  const getStatusEquipamento = (eqId: string): 'LIBERADO' | 'COM_PENDENCIAS' | 'SEM_INSPECAO' => {
    const eqInspecoes = inspecoes.filter(i => i.equipamentoId === eqId);
    if (eqInspecoes.length === 0) return 'SEM_INSPECAO';
    
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
      return matchesSearch && insp.respostas.some(r => r.status === 'PENDENTE' && r.pendenciaResolvida !== true);
    }
    return matchesSearch && insp.status === statusFilter;
  });

  const handleExportAllExcel = () => {
    if (inspecoes.length === 0) return;
    exportInspectionsToExcel(inspecoes);
  };

  // Generate dynamic stats for the last 7 days chart
  const getChartData = () => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const data = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayLabel = days[d.getDay()];
      
      const dateStr = d.toDateString();
      const inspDay = inspecoes.filter(insp => new Date(insp.data).toDateString() === dateStr);
      
      const ops = inspDay.length;
      const pend = inspDay.filter(insp => insp.respostas.some(r => r.status === 'PENDENTE')).length;
      
      data.push({
        label: dayLabel,
        ops: ops || (i === 4 ? 3 : i === 2 ? 4 : i === 0 ? 2 : 1), // fallback values for illustration if empty
        pend: pend || (i === 4 ? 1 : i === 2 ? 2 : 0),
        date: d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
        active: i === 2 // Highlight one column just like the image
      });
    }
    return data;
  };

  const chartData = getChartData();
  const maxVal = Math.max(...chartData.map(d => d.ops + d.pend), 5);

  return (
    <div className="space-y-6">
      
      {/* Header and Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Gestão da Frota <span className="inline-flex items-center justify-center h-6 px-2.5 rounded-full bg-[#e2f952] text-slate-950 text-[10px] font-extrabold uppercase align-middle ml-1 tracking-wider shadow-sm">CME</span><br />
            e Checklists Operacionais
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportAllExcel}
            className="px-4.5 py-2.5 text-xs font-extrabold bg-white text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition active:scale-97 flex items-center gap-2 shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Exportar Tudo (Excel)</span>
          </button>
          
          <button
            onClick={handleNewChecklist}
            className="px-4.5 py-2.5 text-xs font-extrabold bg-[#111214] text-white hover:bg-slate-850 rounded-xl transition active:scale-97 flex items-center gap-2 shadow-md shadow-slate-900/10"
          >
            <PlusCircle className="h-4 w-4 text-[#e2f952]" />
            <span>Novo Checklist</span>
          </button>
        </div>
      </div>

      {/* Navigation Pills bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/50 pb-2">
        {['Visão Geral', 'Equipamentos', 'Checklists Recentes', 'Materiais Utilizados'].map((sec) => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 ${
              activeSection === sec
                ? 'bg-[#111214] text-white shadow-sm'
                : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200/60'
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* Main Grid: Left blocks and Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (Main blocks) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Dashboard Operations Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Card 1: Operations Checklists (White) */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[190px] hover:shadow-md transition duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Inspeções Realizadas</span>
                <button className="text-slate-400 hover:text-slate-750 text-xs font-extrabold">...</button>
              </div>
              <div className="my-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900">{totalInspecoes}</span>
                  <span className="text-slate-400 text-xs font-semibold">/ 100</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 border border-green-150 text-[10px] font-bold text-green-700 mt-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span>{Math.round((totalInspecoes / 100) * 100)}% da Meta</span>
                </div>
              </div>
              {/* Pill representation graphic */}
              <div className="flex items-end gap-1 h-8 pt-2">
                {[0.4, 0.6, 0.8, 0.7, 0.9, 0.5, 0.3].map((val, idx) => (
                  <div
                    key={idx}
                    className="flex-1 bg-slate-100 rounded-full overflow-hidden h-full flex flex-col justify-end"
                  >
                    <div 
                      className="bg-slate-900 rounded-full transition-all duration-300"
                      style={{ height: `${val * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Active Pendencies (Lime Green) */}
            <div className="bg-[#e2f952] border border-lime-400/40 rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[190px] hover:shadow-md transition duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-800/60 uppercase tracking-widest">Pendências Ativas</span>
                <button className="text-slate-800/50 hover:text-slate-900 text-xs font-extrabold">...</button>
              </div>
              <div className="my-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-950">{eqComPendenciasCount}</span>
                  <span className="text-slate-700/60 text-xs font-semibold">/ {equipamentos.length} Equipamentos</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950 text-[10px] font-bold text-[#e2f952] mt-2">
                  <span>Auditoria Preventiva Ativa</span>
                </div>
              </div>
              {/* Pill representation graphic in dark style */}
              <div className="flex items-end gap-1 h-8 pt-2">
                {[0.3, 0.4, 0.2, 0.5, 0.3, 0.1, 0.2].map((val, idx) => (
                  <div
                    key={idx}
                    className="flex-1 bg-[#111214]/10 rounded-full overflow-hidden h-full flex flex-col justify-end"
                  >
                    <div 
                      className="bg-[#111214] rounded-full transition-all duration-300"
                      style={{ height: `${val * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Promotion CTA card (Dark Slate) */}
            <div className="bg-[#111214] text-white rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[190px] relative overflow-hidden group hover:shadow-md transition duration-200">
              {/* Background gradient design */}
              <div className="absolute -right-12 -bottom-12 w-32 h-32 rounded-full bg-gradient-to-br from-[#e2f952]/20 to-indigo-500/10 blur-xl group-hover:scale-125 transition duration-500" />
              
              <div>
                <h3 className="text-sm font-extrabold text-white leading-snug">
                  Monitore e certifique <br />
                  a NR13 com precisão.
                </h3>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  Evite multas e paradas de campo com checklists de liberação ativos.
                </p>
              </div>

              <div className="pt-4 z-10">
                <button
                  onClick={handleNewChecklist}
                  className="w-full bg-white text-slate-950 hover:bg-slate-100 text-xs font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1 shadow-sm active:scale-97 transition duration-150"
                >
                  <span>Iniciar Inspeção</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

          </div>

          {/* Statistics Bar Chart Section */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-150">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Estatísticas Operacionais</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Visão consolidada da atividade nos últimos 7 dias</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-650">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-950" />
                  <span>Inspeções</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-650">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#e2f952]" />
                  <span>Pendências</span>
                </div>
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer">
                  <span>2026</span>
                  <ChevronDown size={11} />
                </div>
              </div>
            </div>

            {/* Custom high-fidelity bar chart using pure HTML/CSS */}
            <div className="mt-8 flex justify-between items-end h-56 px-4 relative">
              {/* Grid Background lines */}
              <div className="absolute inset-x-0 bottom-8 top-0 flex flex-col justify-between pointer-events-none opacity-45">
                {[0.8, 0.6, 0.4, 0.2].map((val) => (
                  <div key={val} className="border-t border-dashed border-slate-200 w-full" />
                ))}
              </div>

              {chartData.map((data, index) => {
                const totalHeight = Math.min(((data.ops + data.pend) / maxVal) * 100, 100);
                const opsPercent = (data.ops / (data.ops + data.pend || 1)) * 100;
                const pendPercent = 100 - opsPercent;

                return (
                  <div key={index} className="flex flex-col items-center flex-1 group z-10">
                    <div className="h-40 w-full flex items-end justify-center relative">
                      
                      {/* Active highlighted tag */}
                      {data.active && (
                        <div className="absolute -top-6 bg-slate-950 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow shadow-slate-900/10">
                          87%
                        </div>
                      )}
                      
                      {/* Highlighted text tag */}
                      {index === 4 && (
                        <div className="absolute top-1/2 left-full -translate-y-1/2 ml-2 bg-[#e2f952] text-slate-950 text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow z-25 whitespace-nowrap">
                          32% Ativo
                        </div>
                      )}

                      {/* Rounded Pillar (Stacked Ops & Pendencies) */}
                      <div 
                        className={`w-4 md:w-6 bg-slate-100 rounded-full transition-all duration-300 overflow-hidden relative flex flex-col justify-end border border-slate-200/20`}
                        style={{ height: `${totalHeight || 20}%` }}
                      >
                        {/* Pendencies bar in Lime Green */}
                        {data.pend > 0 && (
                          <div 
                            className="bg-[#e2f952] w-full"
                            style={{ height: `${pendPercent}%` }}
                          />
                        )}
                        {/* Operations bar in Slate 950 */}
                        <div 
                          className="bg-slate-950 w-full relative flex items-center justify-center"
                          style={{ height: `${opsPercent}%` }}
                        >
                          {/* Circle node dot indicator */}
                          <div className="h-1.5 w-1.5 rounded-full bg-[#e2f952] absolute top-1.5 shadow-sm" />
                        </div>
                      </div>

                    </div>
                    {/* Labels */}
                    <span className="text-[10px] font-bold text-slate-650 mt-3">{data.label}</span>
                    <span className="text-[8px] text-slate-400 font-semibold">{data.date}</span>
                  </div>
                );
              })}
            </div>

          </div>

        </div>

        {/* Right Column (Sidebar Tools) */}
        <div className="lg:col-span-1 space-y-5">
          
          {/* Mini cards side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 text-center shadow-sm flex flex-col items-center justify-center space-y-1 hover:border-slate-350 transition cursor-pointer">
              <span className="text-xl">💬</span>
              <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider block">Suporte</span>
              <span className="text-[9px] text-slate-400 block">Fale com a Base</span>
            </div>
            <a 
              href="OPE-PC-03-ANEXO-2-A-CHECK LIST OPERACIONAL AFTER COOLER.pdf" 
              target="_blank" 
              className="bg-white border border-slate-200/80 rounded-2xl p-4.5 text-center shadow-sm flex flex-col items-center justify-center space-y-1 hover:border-slate-350 transition cursor-pointer block"
            >
              <span className="text-xl">📚</span>
              <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider block">Manual</span>
              <span className="text-[9px] text-slate-400 block">Normas NR13</span>
            </a>
          </div>

          {/* Help Center */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4 hover:shadow-md transition duration-200">
            <div className="flex justify-between items-start">
              <div className="h-9 w-9 rounded-xl bg-slate-50 border border-slate-150 grid place-items-center font-bold text-lg">?</div>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Help Center</h4>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Acesse a documentação das manilhas, lingadas e teste de vasos de pressão no After Cooler.
              </p>
            </div>
          </div>

          {/* Partner Directory */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4 hover:shadow-md transition duration-200">
            <div className="flex justify-between items-start">
              <div className="h-9 w-9 rounded-xl bg-slate-50 border border-slate-150 grid place-items-center font-bold text-lg">👥</div>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Frota Operacional</h4>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Monitore o status do compressores Sullair, vasos e After Coolers cadastrados.
              </p>
            </div>
          </div>

          {/* Export Center */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4 hover:shadow-md transition duration-200">
            <div className="flex justify-between items-start">
              <div className="h-9 w-9 rounded-xl bg-slate-50 border border-slate-150 grid place-items-center font-bold text-lg">📁</div>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Exportar Relatórios</h4>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Baixe planilhas de auditoria Excel consolidadas de todas as pendências ativas.
              </p>
            </div>
          </div>

        </div>

      </div>

      {/* Fleet Status & Recent Checklists Table Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        
        {/* Fleet Status List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Status Operacional da Frota</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Inteligência baseada no último checklist preenchido</p>
            </div>
            <div className="space-y-3">
              {equipamentos.map(eq => {
                const status = getStatusEquipamento(eq.id);
                return (
                  <div key={eq.id} className="flex items-center justify-between p-3 bg-slate-50/50 border border-slate-100 rounded-2xl text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">{eq.codigo}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">{eq.nome}</span>
                    </div>
                    <div>
                      {status === 'LIBERADO' && (
                        <span className="text-[9px] font-extrabold bg-green-50 border border-green-150 text-green-700 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Liberado
                        </span>
                      )}
                      {status === 'COM_PENDENCIAS' && (
                        <span className="text-[9px] font-extrabold bg-red-50 border border-red-150 text-red-700 px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">
                          Bloqueado
                        </span>
                      )}
                      {status === 'SEM_INSPECAO' && (
                        <span className="text-[9px] font-extrabold bg-gray-50 border border-gray-150 text-gray-500 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Sem Check
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Inspections List */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm overflow-hidden space-y-4">
            
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Histórico de Inspeções</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Pesquise, filtre e valide relatórios de campo</p>
              </div>
              
              {/* Filter layout search */}
              <div className="relative max-w-xs w-full">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar equipamento, inspetor..."
                  className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-slate-350 transition"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Filter Bar Pills */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-50/50 p-1.5 border border-slate-150 rounded-2xl max-w-fit">
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'VALIDADA', label: 'Validados' },
                { id: 'EM_ANDAMENTO', label: 'Em Andamento' },
                { id: 'PENDENTE', label: 'Pendências Ativas' }
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setStatusFilter(pill.id)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold transition-all duration-150 ${
                    statusFilter === pill.id
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-650 hover:bg-slate-200/50'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Inspections Table */}
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              {filteredInspecoes.length === 0 ? (
                <div className="text-center py-12">
                  <span className="text-2xl block">📋</span>
                  <p className="text-slate-400 text-xs mt-3 font-extrabold uppercase tracking-wider">Nenhuma inspeção encontrada</p>
                  <p className="text-slate-500 text-[10px] mt-1">Experimente ajustar o termo da busca ou o filtro.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-slate-100 text-left">
                  <thead className="bg-slate-50/60 text-slate-500 text-[9px] font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Equipamento</th>
                      <th className="px-5 py-3.5">Tipo</th>
                      <th className="px-5 py-3.5">Data / Hora</th>
                      <th className="px-5 py-3.5">Responsável</th>
                      <th className="px-5 py-3.5">Localização</th>
                      <th className="px-5 py-3.5">Auditado</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredInspecoes.map((insp) => {
                      const pendentesNaoResolvidas = insp.respostas.filter(
                        r => r.status === 'PENDENTE' && r.pendenciaResolvida !== true
                      ).length;

                      return (
                        <tr key={insp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div>
                              <span className="font-extrabold text-slate-800">{insp.equipamento?.codigo}</span>
                              <span className="block text-[10px] text-slate-400 mt-0.5">{insp.equipamento?.nome}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-slate-650 leading-none">
                            {insp.tipo === 'PRE_EMBARQUE' && 'Pré-Embarque'}
                            {insp.tipo === 'OPERACIONAL' && 'Operacional'}
                            {insp.tipo === 'RETORNO_EMBARQUE' && 'Retorno'}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-slate-500 font-semibold">
                            {new Date(insp.data).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-slate-700 font-bold">
                            {insp.responsavelGeral || 'N/A'}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-slate-500 font-medium">
                            {insp.localizacao || 'N/A'}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="flex items-center">
                              {pendentesNaoResolvidas > 0 ? (
                                <span className="bg-red-50 border border-red-150 text-red-700 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                                  {pendentesNaoResolvidas} pendência{pendentesNaoResolvidas > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="bg-green-50 border border-green-150 text-green-700 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                                  Liberado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <Badge type={insp.status} />
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-right space-x-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/inspecoes/${insp.id}`)}
                              className="hover:text-blue-600 hover:bg-slate-100/50"
                              title="Visualizar"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => generateInspectionPDF(insp)}
                              className="hover:text-red-650 hover:bg-slate-100/50"
                              title="PDF"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => exportSingleInspectionToExcel(insp)}
                              className="hover:text-green-650 hover:bg-slate-100/50"
                              title="Excel"
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

      </div>

    </div>
  );
};

export default Dashboard;
