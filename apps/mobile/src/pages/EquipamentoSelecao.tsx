import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, MapPin, User, Settings2, ShieldCheck, MapPinIcon, Search, Check } from 'lucide-react';
import { Card, Button } from '@cme/ui';
import api from '../services/api';
import { Equipamento, TipoInspecao, maiusculas } from '@cme/types';

export const EquipamentoSelecao: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [busca, setBusca] = useState('');
  const [autoSelectCodigo, setAutoSelectCodigo] = useState<string | null>(null);
  const [selectedEqId, setSelectedEqId] = useState('');
  const [tipoInspecao, setTipoInspecao] = useState<TipoInspecao>('PRE_EMBARQUE');
  const [responsavel, setResponsavel] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [compressorUtilizado, setCompressorUtilizado] = useState('');
  const [classificacao, setClassificacao] = useState<'NIVEL_1' | 'NIVEL_2' | 'REBUILD'>('NIVEL_1');

  // New fields requested by user
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');

  // Responsável logado + pré-seleção via ?equip= (gerar checklist 1-clique)
  useEffect(() => {
    const user = api.auth.currentUser();
    if (user) setResponsavel(user.nome);
    const equipParam = searchParams.get('equip');
    if (equipParam) {
      setAutoSelectCodigo(equipParam);
      setBusca(equipParam);
    }
  }, [searchParams]);

  // Busca inteligente (server-side) com debounce
  useEffect(() => {
    const t = setTimeout(() => {
      api.equipamentos.list(busca.trim() || undefined).then((data) => {
        setEquipamentos(data);
        if (autoSelectCodigo) {
          const found = data.find(
            (e) => e.codigo === autoSelectCodigo || e.codigoExibicao === autoSelectCodigo
          );
          if (found) setSelectedEqId(found.id);
          setAutoSelectCodigo(null);
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEq = equipamentos.find((e) => e.id === selectedEqId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEqId) {
      alert('Selecione um equipamento para iniciar.');
      return;
    }

    // Metadados na sessão (texto livre normalizado em MAIÚSCULAS)
    const metadata = {
      equipamentoId: selectedEqId,
      tipo: tipoInspecao,
      responsavelGeral: maiusculas(responsavel),
      localizacao: maiusculas(localizacao),
      compressorUtilizado: maiusculas(compressorUtilizado),
      classificacao,
      origem: maiusculas(origem),
      destino: maiusculas(destino),
    };
    window.sessionStorage.setItem('cme_nova_inspecao_meta', JSON.stringify(metadata));
    navigate('/checklist');
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-[#0b132b] text-[#38bdf8] grid place-items-center mb-3 shadow-md shadow-blue-900/10">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 leading-tight uppercase tracking-tight">
          CHECK LIST OPERACIONAL DE LIBERAÇÃO DE EQUIPAMENTO
        </h1>
        <p className="text-slate-500 text-[10px] mt-1.5 uppercase font-bold tracking-wider">
          Inspeção Operacional de After Cooler
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* Equipamento */}
        <Card title="1. Equipamento">
          <div className="space-y-3">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                inputMode="search"
                placeholder="Buscar: CME-AFTE.001, afte 001, compressor..."
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            {selectedEq && (
              <div className="text-[11px] bg-[#0b132b] text-white rounded-xl px-3 py-2 flex items-center justify-between">
                <span className="font-bold truncate">{selectedEq.codigoExibicao || selectedEq.codigo}</span>
                <span className="text-[#38bdf8] font-bold uppercase text-[9px]">{selectedEq.tipo}</span>
              </div>
            )}

            <div className="max-h-56 overflow-y-auto space-y-1.5 -mr-1 pr-1">
              {equipamentos.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-4">Nenhum equipamento encontrado.</p>
              ) : (
                equipamentos.map((eq) => {
                  const sel = eq.id === selectedEqId;
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => setSelectedEqId(eq.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition flex items-center justify-between gap-2 ${
                        sel ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="font-bold text-slate-800 block truncate">{eq.codigoExibicao || eq.codigo}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{eq.tipo} · {eq.localizacaoAtual || '—'}</span>
                      </span>
                      {sel && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        {/* Tipo de Inspeção */}
        <Card title="2. Tipo de Inspeção">
          <div className="grid grid-cols-3 gap-2">
            {(['PRE_EMBARQUE', 'OPERACIONAL', 'RETORNO_EMBARQUE'] as TipoInspecao[]).map(tipo => (
              <button
                key={tipo}
                type="button"
                onClick={() => setTipoInspecao(tipo)}
                className={`py-3 px-1 rounded-xl text-xs font-bold text-center border transition-all duration-200 ${
                  tipoInspecao === tipo
                    ? 'bg-[#0b132b] border-[#0b132b] text-white shadow-md shadow-blue-900/10'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tipo === 'PRE_EMBARQUE' && 'Pré-Embarque'}
                {tipo === 'OPERACIONAL' && 'Operacional'}
                {tipo === 'RETORNO_EMBARQUE' && 'Retorno'}
              </button>
            ))}
          </div>
        </Card>

        {/* Informações de Campo */}
        <Card title="3. Detalhes Operacionais">
          <div className="space-y-4">
            
            {/* Responsável */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Responsável Técnico</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Nome do inspetor"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              />
            </div>

            {/* Localização */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>Localização / Base</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Ex: Plataforma, Oficina, Base"
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
              />
            </div>

            {/* Origem */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <MapPinIcon className="h-3.5 w-3.5 text-slate-400" />
                <span>Origem</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Base de Origem (Ex: Macaé)"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
              />
            </div>

            {/* Destino */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <MapPinIcon className="h-3.5 w-3.5 text-slate-400" />
                <span>Destino</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Destino do Equipamento (Ex: P-55)"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              />
            </div>

            {/* Compressor */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-slate-400" />
                <span>Compressores Utilizados no Teste</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Ex: Sullair 750 (ID: CP-01)"
                value={compressorUtilizado}
                onChange={(e) => setCompressorUtilizado(e.target.value)}
              />
            </div>

            {/* Classificação */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Classificação do Equipamento</label>
              <div className="grid grid-cols-3 gap-2">
                {(['NIVEL_1', 'NIVEL_2', 'REBUILD'] as const).map(classVal => (
                  <button
                    key={classVal}
                    type="button"
                    onClick={() => setClassificacao(classVal)}
                    className={`py-2 px-1 rounded-lg text-xs font-bold text-center border transition-all duration-200 ${
                      classificacao === classVal
                        ? 'bg-[#0b132b] border-[#0b132b] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {classVal.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </Card>

        {/* Submit */}
        <Button type="submit" fullWidth size="xl" className="flex items-center justify-center space-x-2 bg-[#0b132b] text-white hover:bg-[#1b2a47] shadow-md shadow-blue-900/10 py-3 rounded-xl font-bold">
          <span>Iniciar Preenchimento</span>
          <ArrowRight className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
};

export default EquipamentoSelecao;