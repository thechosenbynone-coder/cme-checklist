import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, User, Settings2, MapPinIcon, Search, Check, ClipboardList, ChevronRight } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { AppHeader } from '../components/ui/AppHeader';
import { cn } from '../lib/cn';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { Equipamento, ChecklistModelo, TipoInspecao, maiusculas } from '@cme/types';
import { StepTray } from '../components/ui/StepTray';

export const EquipamentoSelecao: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [busca, setBusca] = useState('');
  const [autoSelectCodigo, setAutoSelectCodigo] = useState<string | null>(null);
  const [selectedEqId, setSelectedEqId] = useState('');
  const [selectedEq, setSelectedEq] = useState<Equipamento | null>(null);
  const [tipoInspecao, setTipoInspecao] = useState<TipoInspecao | null>(null);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  // Modelos de checklist disponíveis + tipo escolhido (Passo 1)
  const [modelos, setModelos] = useState<ChecklistModelo[]>([]);
  const [tipoChecklist, setTipoChecklist] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const step4Ref = useRef<HTMLDivElement>(null);

  // Tipos de checklist distintos (versão ativa mais recente de cada tipo).
  // A lista vem ordenada por tipoEquipamento asc, versao desc — o 1º ativo de cada tipo é o atual.
  const tiposChecklist = useMemo(() => {
    const seen = new Set<string>();
    const out: { tipo: string; nome: string; itens: number }[] = [];
    for (const m of modelos) {
      if (!m.ativo || seen.has(m.tipoEquipamento)) continue;
      seen.add(m.tipoEquipamento);
      out.push({ tipo: m.tipoEquipamento, nome: m.nome, itens: (m as any)._count?.itens ?? 0 });
    }
    return out;
  }, [modelos]);

  // Auto-focus na busca quando o passo de Equipamento (2) fica ativo
  useEffect(() => {
    if (activeStep === 2) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [activeStep]);

  const [responsavel, setResponsavel] = useState('');
  const [compressorUtilizado, setCompressorUtilizado] = useState('');
  const [classificacao, setClassificacao] = useState<'NIVEL_1' | 'NIVEL_2' | 'REBUILD'>('NIVEL_1');

  // New fields requested by user
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');

  // Carrega modelos disponíveis + responsável logado + pré-seleção via ?equip=
  useEffect(() => {
    api.modelos.list().then(setModelos).catch(() => setModelos([]));
    const user = api.auth.currentUser();
    if (user) setResponsavel(user.nome);
    const equipParam = searchParams.get('equip');
    if (equipParam) {
      setAutoSelectCodigo(equipParam);
      setBusca(equipParam);
    }
  }, [searchParams]);

  // Pré-seleção 1-clique via ?equip=CODIGO: descobre o tipo do equipamento e pula direto.
  useEffect(() => {
    if (!autoSelectCodigo) return;
    let cancel = false;
    api.equipamentos.list(autoSelectCodigo).then((data) => {
      if (cancel) return;
      const found = data.find(
        (e) => e.codigo === autoSelectCodigo || e.codigoExibicao === autoSelectCodigo
      );
      if (found) {
        setTipoChecklist(found.tipo);
        setSelectedEqId(found.id);
        setSelectedEq(found);
        setActiveStep(3);
      }
      setAutoSelectCodigo(null);
    });
    return () => { cancel = true; };
  }, [autoSelectCodigo]);

  // Busca de equipamentos (server-side, com debounce), restrita ao tipo de checklist escolhido.
  useEffect(() => {
    if (!tipoChecklist) {
      setEquipamentos([]);
      return;
    }
    const q = busca.trim() || tipoChecklist; // sem texto: lista os equipamentos do tipo
    const t = setTimeout(() => {
      api.equipamentos.list(q).then((data) => {
        setEquipamentos(data.filter((e) => e.tipo === tipoChecklist));
      });
    }, 250);
    return () => clearTimeout(t);
  }, [busca, tipoChecklist]);

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
    if (!tipoInspecao) {
      alert('Selecione o tipo de inspeção.');
      return;
    }

    const inspecaoId = generateUUID();
    const metadata = {
      equipamentoId: selectedEqId,
      tipo: tipoInspecao,
      // Tipo do equipamento (Booster/Compressor/Membrana/After Cooler) — define
      // qual modelo de checklist será carregado. Distinto de `tipo` (inspeção).
      equipamentoTipo: (selectedEq?.tipo || tipoChecklist || '') as string,
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
      serverCreated: false,
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

  const scrollToStep = (stepIndex: number) => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const behavior = mediaQuery.matches ? 'auto' : 'smooth';
    const ref = stepIndex === 1 ? step1Ref : stepIndex === 2 ? step2Ref : stepIndex === 3 ? step3Ref : step4Ref;
    ref.current?.scrollIntoView({ behavior, block: 'nearest' });
  };

  const getTipoLabel = (tipo: TipoInspecao | null) => {
    if (tipo === 'PRE_EMBARQUE') return 'Pré-Embarque';
    if (tipo === 'OPERACIONAL') return 'Operacional';
    if (tipo === 'RETORNO_EMBARQUE') return 'Retorno';
    return '';
  };

  const step4Completed =
    responsavel.trim() !== '' &&
    origem.trim() !== '' &&
    destino.trim() !== '' &&
    compressorUtilizado.trim() !== '';
  const allStepsDone = tipoChecklist !== null && selectedEqId !== '' && tipoInspecao !== null && step4Completed;

  return (
    <div className="min-h-[100dvh] bg-bg text-content flex flex-col">
      <AppHeader title="CHECK LIST OPERACIONAL" subtitle={tipoChecklist ? `Inspeção de ${tipoChecklist}` : 'Selecione o checklist'} />

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="max-w-md mx-auto px-4 py-6 space-y-5 safe-bottom">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Step 1: Tipo de Checklist */}
            <div ref={step1Ref}>
              <StepTray
                index={1}
                title="Tipo de Checklist"
                state={activeStep === 1 ? 'active' : (tipoChecklist ? 'done' : 'active')}
                summary={tipoChecklist || undefined}
                onEdit={() => setActiveStep(1)}
                onAnimationComplete={() => {
                  if (activeStep === 1) scrollToStep(1);
                }}
              >
                <div className="space-y-2">
                  {tiposChecklist.length === 0 ? (
                    <p className="text-[11px] text-muted text-center py-4">Carregando checklists disponíveis…</p>
                  ) : (
                    tiposChecklist.map(({ tipo, itens }) => {
                      const sel = tipo === tipoChecklist;
                      return (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => {
                            if (tipo !== tipoChecklist) {
                              // troca de tipo: limpa equipamento selecionado e busca
                              setTipoChecklist(tipo);
                              setSelectedEqId('');
                              setSelectedEq(null);
                              setBusca('');
                            }
                            setActiveStep(2);
                          }}
                          className={cn(
                            'w-full text-left px-3 py-3 rounded-xl border text-xs transition flex items-center justify-between gap-2 min-h-[52px]',
                            sel ? 'bg-accent/10 border-accent' : 'bg-surface border-border hover:bg-surface-2'
                          )}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span className="h-9 w-9 rounded-xl bg-accent/10 border border-accent/20 grid place-items-center text-accent shrink-0">
                              <ClipboardList className="h-4.5 w-4.5" />
                            </span>
                            <span className="min-w-0">
                              <span className="font-bold text-content block truncate">{tipo}</span>
                              <span className="text-[10px] text-muted block truncate">{itens} itens de verificação</span>
                            </span>
                          </span>
                          {sel ? <Check className="h-4 w-4 text-accent shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </StepTray>
            </div>

            {/* Step 2: Equipamento */}
            <div ref={step2Ref}>
              <StepTray
                index={2}
                title="Equipamento"
                state={!tipoChecklist ? 'idle' : (activeStep === 2 ? 'active' : (selectedEqId ? 'done' : 'active'))}
                summary={selectedEq ? `${selectedEq.codigoExibicao || selectedEq.codigo} · ${selectedEq.nome}` : undefined}
                onEdit={() => setActiveStep(2)}
                onAnimationComplete={() => {
                  if (activeStep === 2) scrollToStep(2);
                }}
              >
                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      type="text"
                      inputMode="search"
                      placeholder={tipoChecklist ? `Buscar ${tipoChecklist}: código, nome...` : 'Buscar equipamento...'}
                      icon={<Search className="h-4 w-4" />}
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                    />
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1.5 -mr-1 pr-1">
                    {equipamentos.length === 0 ? (
                      <p className="text-[11px] text-muted text-center py-4">Nenhum equipamento {tipoChecklist || ''} encontrado.</p>
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
                                setSelectedEq(eq);
                                setActiveStep(3);
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
                </div>
              </StepTray>
            </div>

            {/* Step 3: Tipo de Inspeção */}
            <div ref={step3Ref}>
              <StepTray
                index={3}
                title="Tipo de Inspeção"
                state={(!tipoChecklist || !selectedEqId) ? 'idle' : (activeStep === 3 ? 'active' : (tipoInspecao !== null ? 'done' : 'active'))}
                summary={tipoInspecao ? getTipoLabel(tipoInspecao) : undefined}
                onEdit={() => setActiveStep(3)}
                onAnimationComplete={() => {
                  if (activeStep === 3) scrollToStep(3);
                }}
              >
                <div className="grid grid-cols-3 gap-2">
                  {(['PRE_EMBARQUE', 'OPERACIONAL', 'RETORNO_EMBARQUE'] as TipoInspecao[]).map(tipo => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => {
                        setTipoInspecao(tipo);
                        setActiveStep(4);
                      }}
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
              </StepTray>
            </div>

            {/* Step 4: Detalhes Operacionais */}
            <div ref={step4Ref}>
              <StepTray
                index={4}
                title="Detalhes Operacionais"
                state={(!tipoChecklist || !selectedEqId || tipoInspecao === null) ? 'idle' : (activeStep === 4 ? 'active' : (step4Completed ? 'done' : 'active'))}
                summary={step4Completed ? `${responsavel} · ${origem} ➔ ${destino}` : undefined}
                onEdit={() => setActiveStep(4)}
                onAnimationComplete={() => {
                  if (activeStep === 4) scrollToStep(4);
                }}
              >
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
              </StepTray>
            </div>

            {/* Submit */}
            <AnimatePresence>
              {allStepsDone && (
                <motion.button
                  key="submit-btn"
                  type="submit"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="w-full flex items-center justify-center space-x-2 bg-accent text-white hover:bg-accent/90 shadow-sm py-3.5 rounded-xl font-bold min-h-[48px] active:scale-[0.98] transition"
                >
                  <span>Iniciar Preenchimento</span>
                  <ArrowRight className="h-5 w-5" />
                </motion.button>
              )}
            </AnimatePresence>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EquipamentoSelecao;
