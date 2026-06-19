import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, User, Settings2, ShieldCheck, MapPinIcon, Search, Check } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { AppHeader } from '../components/ui/AppHeader';
import { cn } from '../lib/cn';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [showSearch, setShowSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when search mode is active
  useEffect(() => {
    if (showSearch || !selectedEqId) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [showSearch, selectedEqId]);
  const [responsavel, setResponsavel] = useState('');

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

  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEqId) {
      alert('Selecione um equipamento para iniciar.');
      return;
    }

    const inspecaoId = generateUUID();
    const metadata = {
      equipamentoId: selectedEqId,
      tipo: tipoInspecao,
      responsavelGeral: maiusculas(responsavel),
      compressorUtilizado: maiusculas(compressorUtilizado),
      classificacao,
      origem: maiusculas(origem),
      destino: maiusculas(destino),
      equipamentoCodigo: selectedEq ? (selectedEq.codigoExibicao || selectedEq.codigo) : 'Equipamento',
      equipamentoNome: selectedEq ? selectedEq.nome : '',
    };

    const initialDraft = {
      id: inspecaoId,
      metadata,
      respostas: {},
      fotosEquipamento: [undefined, undefined, undefined],
      materiaisUtilizados: [],
      observacoesGerais: '',
      currentStep: 0,
      dirty: true,
      localUpdatedAt: new Date().toISOString(),
      modeloId: '', 
      modeloVersao: 0,
    };

    localStorage.setItem(`cme_draft_${inspecaoId}`, JSON.stringify(initialDraft));

    const draftsRaw = localStorage.getItem('cme_drafts');
    const drafts: string[] = draftsRaw ? JSON.parse(draftsRaw) : [];
    if (!drafts.includes(inspecaoId)) {
      drafts.push(inspecaoId);
      localStorage.setItem('cme_drafts', JSON.stringify(drafts));
    }

    navigate(`/checklist/${inspecaoId}`);
  };

  return (
    <div className="min-h-[100dvh] bg-bg text-content flex flex-col">
      <AppHeader title="CHECK LIST OPERACIONAL" subtitle="Inspeção de After Cooler" />

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="max-w-md mx-auto px-4 py-6 space-y-5 safe-bottom">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Equipamento */}
            <Card title="1. Equipamento">
              <div className="space-y-3">
                {selectedEq && !showSearch ? (
                  // Estado Selecionado: exibe card limpo e botão "Alterar"
                  <div className="bg-accent/10 border border-accent rounded-xl p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="font-bold text-content block text-sm truncate">
                        {selectedEq.codigoExibicao || selectedEq.codigo}
                      </span>
                      <span className="text-[10px] text-muted block uppercase font-bold tracking-wider mt-0.5">
                        {selectedEq.tipo} · {selectedEq.localizacaoAtual || 'Sem localização'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSearch(true);
                        setBusca(''); // Limpa a busca ao reabrir para mostrar todos
                      }}
                      className="px-3 py-1.5 bg-accent text-white text-xs font-bold rounded-lg active:scale-95 transition min-h-[40px] whitespace-nowrap"
                    >
                      Alterar
                    </button>
                  </div>
                ) : (
                  // Estado de Busca: exibe input e a lista de resultados
                  <>
                    <div className="relative">
                      <Input
                        ref={inputRef}
                        type="text"
                        inputMode="search"
                        placeholder="Buscar: CME-AFTE.001, afte 001, compressor..."
                        icon={<Search className="h-4 w-4" />}
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                      />
                      {selectedEq && (
                        <button
                          type="button"
                          onClick={() => setShowSearch(false)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-[10px] font-bold text-muted hover:text-content"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-1.5 -mr-1 pr-1">
                      {equipamentos.length === 0 ? (
                        <p className="text-[11px] text-muted text-center py-4">Nenhum equipamento encontrado.</p>
                      ) : (
                        <AnimatePresence mode="popLayout">
                          {equipamentos.map((eq) => {
                            const sel = eq.id === selectedEqId;
                            return (
                              <motion.button
                                key={eq.id}
                                layout
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.15 }}
                                type="button"
                                onClick={() => {
                                  setSelectedEqId(eq.id);
                                  setShowSearch(false);
                                }}
                                className={cn(
                                  'w-full text-left px-3 py-3 rounded-xl border text-xs transition flex items-center justify-between gap-2 min-h-[48px]',
                                  sel
                                    ? 'bg-accent/10 border-accent'
                                    : 'bg-surface border-border hover:bg-surface-2'
                                )}
                              >
                                <span className="min-w-0">
                                  <span className="font-bold text-content block truncate">{eq.codigoExibicao || eq.codigo}</span>
                                  <span className="text-[10px] text-muted block truncate">{eq.tipo} · {eq.localizacaoAtual || '—'}</span>
                                </span>
                                {sel && <Check className="h-4 w-4 text-accent shrink-0" />}
                              </motion.button>
                            );
                          })}
                        </AnimatePresence>
                      )}
                    </div>
                  </>
                )}
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
                    className={cn(
                      'py-3 px-1 rounded-xl text-xs font-bold text-center border transition-all duration-200 min-h-[48px]',
                      tipoInspecao === tipo
                        ? 'bg-accent border-accent text-white shadow-sm'
                        : 'bg-surface border-border text-content hover:bg-surface-2'
                    )}
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
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted" />
                    <span>Responsável Técnico</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-content placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                    placeholder="Nome do inspetor"
                    value={responsavel}
                    onChange={(e) => setResponsavel(e.target.value)}
                  />
                </div>



                {/* Origem */}
                <div>
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MapPinIcon className="h-3.5 w-3.5 text-muted" />
                    <span>Origem</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-content placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                    placeholder="Base de Origem (Ex: Macaé)"
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value)}
                  />
                </div>

                {/* Destino */}
                <div>
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MapPinIcon className="h-3.5 w-3.5 text-muted" />
                    <span>Destino</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-content placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                    placeholder="Destino do Equipamento (Ex: P-55)"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                  />
                </div>

                {/* Compressor */}
                <div>
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Settings2 className="h-3.5 w-3.5 text-muted" />
                    <span>Compressores Utilizados no Teste</span>
                  </label>
                  <input
                    type="text"
                    className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-content placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                    placeholder="Ex: Sullair 750 (ID: CP-01)"
                    value={compressorUtilizado}
                    onChange={(e) => setCompressorUtilizado(e.target.value)}
                  />
                </div>

                {/* Classificação */}
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Classificação do Equipamento</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['NIVEL_1', 'NIVEL_2', 'REBUILD'] as const).map(classVal => (
                      <button
                        key={classVal}
                        type="button"
                        onClick={() => setClassificacao(classVal)}
                        className={cn(
                          'py-3 px-1 rounded-xl text-xs font-bold text-center border transition-all duration-200 min-h-[48px]',
                          classificacao === classVal
                            ? 'bg-accent border-accent text-white shadow-sm'
                            : 'bg-surface border-border text-content hover:bg-surface-2'
                        )}
                      >
                        {classVal.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </Card>

            {/* Submit */}
            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-2 bg-accent text-white hover:bg-accent/90 shadow-sm py-3.5 rounded-xl font-bold min-h-[48px] active:scale-[0.98] transition"
            >
              <span>Iniciar Preenchimento</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EquipamentoSelecao;