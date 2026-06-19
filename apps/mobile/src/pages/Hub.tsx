import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, CheckCircle2, AlertTriangle, LogOut, Loader2, ArrowRight, RefreshCw, Clock, User } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { AppHeader } from '../components/ui/AppHeader';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import api from '../services/api';
import { Inspecao } from '@cme/types';
import { cn } from '../lib/cn';

interface DraftLocal {
  id: string;
  metadata: {
    equipamentoId: string;
    tipo: string;
    responsavelGeral: string;
    compressorUtilizado?: string;
    classificacao?: string;
    origem: string;
    destino: string;
    equipamentoCodigo?: string;
    equipamentoNome?: string;
  };
  respostas: Record<string, any>;
  fotosEquipamento: (string | undefined)[];
  materiaisUtilizados: any[];
  observacoesGerais: string;
  currentStep: number;
  dirty: boolean;
  localUpdatedAt: string;
  modeloId: string;
  modeloVersao: number;
}

export const Hub: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [draftsList, setDraftsList] = useState<any[]>([]);
  const [completedList, setCompletedList] = useState<any[]>([]);

  useEffect(() => {
    const user = api.auth.currentUser();
    if (!user) {
      navigate('/login');
      return;
    }
    setCurrentUser(user);
    loadInspections();
  }, [navigate]);

  // Flush drafts marked as dirty to the server
  const flushDirtyDrafts = async () => {
    if (!navigator.onLine) return;
    const localIds = getLocalDraftIds();
    for (const id of localIds) {
      const raw = localStorage.getItem(`cme_draft_${id}`);
      if (raw) {
        try {
          const draft: DraftLocal = JSON.parse(raw);
          if (draft.dirty) {
            // Reconstruct Inspecao payload for autosave
            const finalRespostas = Object.entries(draft.respostas).map(([itemId, value]) => ({
              id: `resp-${itemId}-${Date.now()}`,
              inspecaoId: id,
              itemId,
              status: value.status,
              observacao: value.observacao,
              responsavel: value.responsavel,
              valorNumerico: value.valorNumerico,
              valorTexto: value.valorTexto,
              certificadoId: value.certificadoId,
              certificadoValidade: value.certificadoValidade,
              fotoUrl: value.fotoUrl,
              pendenciaResolvida: value.pendenciaResolvida,
              fotoResolvidaUrl: value.fotoResolvidaUrl,
            }));

            const finalMateriais = draft.materiaisUtilizados.map((mat: any, idx: number) => ({
              id: `mu-${idx}-${Date.now()}`,
              inspecaoId: id,
              materialId: mat.materialId,
              quantidade: mat.quantidade,
              observacao: mat.observacao,
            }));

            const inspecaoPayload: any = {
              id,
              equipamentoId: draft.metadata.equipamentoId,
              tipo: draft.metadata.tipo,
              data: new Date(draft.localUpdatedAt).toISOString(),
              modeloId: draft.modeloId,
              modeloVersao: draft.modeloVersao,
              responsavelGeral: draft.metadata.responsavelGeral,
              status: 'EM_ANDAMENTO',
              observacoesGerais: draft.observacoesGerais,
              respostas: finalRespostas,
              materiais: finalMateriais,
              origem: draft.metadata.origem,
              destino: draft.metadata.destino,
              compressorUtilizado: draft.metadata.compressorUtilizado,
              classificacao: draft.metadata.classificacao,
              fotosUrls: draft.fotosEquipamento.filter((f): f is string => !!f),
            };

            await api.inspecoes.upsert(id, inspecaoPayload);
            // Mark as clean
            draft.dirty = false;
            localStorage.setItem(`cme_draft_${id}`, JSON.stringify(draft));
          }
        } catch (e) {
          console.error('Failed to sync dirty draft', id, e);
        }
      }
    }
  };

  const getLocalDraftIds = (): string[] => {
    try {
      const raw = localStorage.getItem('cme_drafts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const loadInspections = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Try to flush any dirty drafts if we are online
      if (navigator.onLine) {
        setSyncing(true);
        await flushDirtyDrafts();
        setSyncing(false);
      }

      // 2. Load remote inspections
      let remoteInspections: any[] = [];
      try {
        remoteInspections = await api.inspecoes.getMine();
      } catch (err) {
        console.warn('Could not load remote inspections (offline mode)', err);
      }

      // 3. Load local drafts
      const localIds = getLocalDraftIds();
      const localDraftsMap: Record<string, DraftLocal> = {};
      const activeLocalIds: string[] = [];

      localIds.forEach(id => {
        const raw = localStorage.getItem(`cme_draft_${id}`);
        if (raw) {
          try {
            const draft = JSON.parse(raw) as DraftLocal;
            localDraftsMap[id] = draft;
            activeLocalIds.push(id);
          } catch {
            /* ignore */
          }
        }
      });

      // 4. Merge logic
      const mergedDrafts: any[] = [];
      const mergedCompleted: any[] = [];

      // Process remote inspections
      remoteInspections.forEach((remote: any) => {
        const local = localDraftsMap[remote.id];

        if (remote.status === 'CONCLUIDA' || remote.status === 'VALIDADA') {
          // Server has concluded this checklist: completed list
          mergedCompleted.push(remote);

          // Clean up local draft if it exists
          if (local) {
            localStorage.removeItem(`cme_draft_${remote.id}`);
            const updatedLocalIds = getLocalDraftIds().filter(i => i !== remote.id);
            localStorage.setItem('cme_drafts', JSON.stringify(updatedLocalIds));
            delete localDraftsMap[remote.id];
          }
        } else if (remote.status === 'EM_ANDAMENTO') {
          // Active checklist
          if (local && local.dirty) {
            // Local is dirty (unsynced edits) - local wins
            mergedDrafts.push({
              id: local.id,
              status: 'EM_ANDAMENTO',
              tipo: local.metadata.tipo,
              updatedAt: local.localUpdatedAt,
              equipamento: {
                codigo: local.metadata.equipamentoCodigo || 'Equipamento',
                codigoExibicao: local.metadata.equipamentoCodigo || 'Equipamento',
                nome: local.metadata.equipamentoNome || '',
              },
              respostasCount: Object.keys(local.respostas).length,
              isLocalDraft: true,
              dirty: true,
              currentStep: local.currentStep,
            });
          } else {
            // Remote matches or wins
            mergedDrafts.push({
              id: remote.id,
              status: 'EM_ANDAMENTO',
              tipo: remote.tipo,
              updatedAt: remote.updatedAt || remote.data,
              equipamento: remote.equipamento,
              respostasCount: remote._count?.respostas || 0,
              isLocalDraft: !!local,
              dirty: false,
              currentStep: local ? local.currentStep : 0,
            });
          }
          // Remove processed local id
          if (local) delete localDraftsMap[remote.id];
        }
      });

      // Process remaining local drafts (which are not yet on the server at all)
      Object.values(localDraftsMap).forEach((local) => {
        mergedDrafts.push({
          id: local.id,
          status: 'EM_ANDAMENTO',
          tipo: local.metadata.tipo,
          updatedAt: local.localUpdatedAt,
          equipamento: {
            codigo: local.metadata.equipamentoCodigo || 'Equipamento',
            codigoExibicao: local.metadata.equipamentoCodigo || 'Equipamento',
            nome: local.metadata.equipamentoNome || '',
          },
          respostasCount: Object.keys(local.respostas).length,
          isLocalDraft: true,
          dirty: local.dirty,
          currentStep: local.currentStep,
        });
      });

      // Sort by updatedAt descending
      mergedDrafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      mergedCompleted.sort((a, b) => new Date(b.updatedAt || b.data).getTime() - new Date(a.updatedAt || a.data).getTime());

      setDraftsList(mergedDrafts);
      setCompletedList(mergedCompleted);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao carregar e mesclar rascunhos.');
    } finally {
      setLoading(false);
    }
  };

  // Re-sync listener on focus & online
  useEffect(() => {
    const handleEvents = () => {
      loadInspections();
    };

    window.addEventListener('online', handleEvents);
    window.addEventListener('focus', handleEvents);
    return () => {
      window.removeEventListener('online', handleEvents);
      window.removeEventListener('focus', handleEvents);
    };
  }, []);

  const handleLogout = () => {
    if (window.confirm('Deseja realmente sair?')) {
      api.auth.logout();
      navigate('/login');
    }
  };

  const fmtDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'PRE_EMBARQUE': return 'Pré-Embarque';
      case 'OPERACIONAL': return 'Operacional';
      case 'RETORNO_EMBARQUE': return 'Retorno';
      default: return tipo;
    }
  };

  // draft list limit cap (index simple cleanup of obsolete items)
  // this is to keep localstorage healthy
  useEffect(() => {
    try {
      const localIds = getLocalDraftIds();
      if (localIds.length > 20) {
        // Keep 20 most recent local drafts and prune the rest
        const draftsInfo = localIds.map(id => {
          const raw = localStorage.getItem(`cme_draft_${id}`);
          if (raw) {
            try {
              const d = JSON.parse(raw);
              return { id, time: new Date(d.localUpdatedAt).getTime() };
            } catch {
              return { id, time: 0 };
            }
          }
          return { id, time: 0 };
        });

        draftsInfo.sort((a, b) => b.time - a.time);
        const keepIds = draftsInfo.slice(0, 20).map(d => d.id);
        const discard = draftsInfo.slice(20);

        discard.forEach(d => {
          localStorage.removeItem(`cme_draft_${d.id}`);
        });

        localStorage.setItem('cme_drafts', JSON.stringify(keepIds));
      }
    } catch (e) {
      console.error('Error pruning drafts index', e);
    }
  }, [draftsList]);

  return (
    <div className="min-h-[100dvh] bg-bg text-content flex flex-col pb-24 relative select-none">
      <AppHeader title="CME CHECKLIST" subtitle="Painel de Campo">
        <button
          onClick={handleLogout}
          className="p-2 text-white/80 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition min-h-[48px] min-w-[48px] flex items-center justify-center"
          aria-label="Sair"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 space-y-6">
        {currentUser && (
          <div className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 grid place-items-center text-accent">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Inspetor Conectado</p>
              <h2 className="text-sm font-bold text-content leading-tight mt-0.5">{currentUser.nome}</h2>
            </div>
            {syncing && (
              <div className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-accent-text uppercase tracking-wider">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Sincronizando...</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-xs p-3 rounded-xl flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-xs text-muted font-semibold uppercase tracking-wider">Carregando Inspeções...</p>
          </div>
        ) : (
          <div className="space-y-6 max-w-md mx-auto">
            
            {/* RASCUNHOS / EM ANDAMENTO */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Em Andamento ({draftsList.length})</span>
                </h3>
              </div>

              {draftsList.length === 0 ? (
                <div className="bg-surface/50 border border-dashed border-border rounded-2xl py-8 text-center text-xs text-muted font-medium">
                  Nenhum rascunho ativo. Toque no (+) para iniciar.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {draftsList.map(draft => (
                    <button
                      key={draft.id}
                      onClick={() => navigate(`/checklist/${draft.id}`)}
                      className="w-full text-left bg-surface border border-border hover:bg-surface-2 rounded-2xl p-4 transition-all duration-200 flex items-center justify-between group active:scale-[0.99] relative overflow-hidden"
                    >
                      <div className="space-y-2 min-w-0 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-content truncate">
                            {draft.equipamento.codigoExibicao || draft.equipamento.codigo}
                          </span>
                          <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wider">
                            Rascunho
                          </span>
                          {draft.dirty && (
                            <span className="text-[9px] bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wider animate-pulse">
                              Offline
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-2 text-[10px] text-muted font-semibold uppercase flex-wrap gap-y-1">
                          <span>{getTipoLabel(draft.tipo)}</span>
                          <span>•</span>
                          <span>Ref: {fmtDate(draft.updatedAt)}</span>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted group-hover:text-accent group-hover:translate-x-0.5 transition flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* CONCLUÍDOS */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5 px-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Concluídos ({completedList.length})</span>
              </h3>

              {completedList.length === 0 ? (
                <div className="bg-surface/50 border border-dashed border-border rounded-2xl py-8 text-center text-xs text-muted font-medium">
                  Nenhuma inspeção concluída recentemente.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {completedList.map(item => {
                    const isValidated = item.status === 'VALIDADA';
                    return (
                      <div
                        key={item.id}
                        className="bg-surface/75 border border-border/80 rounded-2xl p-4 flex items-center justify-between opacity-85 hover:opacity-100 transition-opacity"
                      >
                        <div className="space-y-1.5 min-w-0 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-content truncate">
                              {item.equipamento?.codigoExibicao || item.equipamento?.codigo}
                            </span>
                            <span className={cn(
                              'text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wider border',
                              isValidated
                                ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
                                : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                            )}>
                              {isValidated ? 'Validado' : 'Concluído'}
                            </span>
                          </div>
                          <div className="flex items-center gap-x-2 text-[9px] text-muted font-semibold uppercase flex-wrap">
                            <span>{getTipoLabel(item.tipo)}</span>
                            <span>•</span>
                            <span>{fmtDate(item.updatedAt || item.data)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Floating circular "+" button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <button
          onClick={() => navigate('/novo')}
          className="h-14 w-14 rounded-full bg-accent text-white grid place-items-center shadow-lg shadow-accent/25 hover:bg-accent/90 active:scale-95 transition"
          aria-label="Nova inspeção"
        >
          <Plus className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
};

export default Hub;
