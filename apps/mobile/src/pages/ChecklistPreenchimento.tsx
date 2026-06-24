import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Save, Plus, Trash, ShieldCheck, ChevronRight, ChevronLeft, Camera, Pin, Check, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { AppHeader } from '../components/ui/AppHeader';
import { cn } from '../lib/cn';
import api from '../services/api';
import { Equipamento, ChecklistModelo, Material, StatusItem, maiusculas } from '@cme/types';

// Formata ISO (YYYY-MM-DD...) para DD/MM/AAAA
const fmtBR = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};

// Step transition animation variants
const stepVariants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
};

interface DraftLocal {
  id: string;
  metadata: {
    equipamentoId: string;
    tipo: string;
    equipamentoTipo?: string;
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
  serverCreated?: boolean; // inspeção já criada no servidor (POST /iniciar)
}

// Reconstrói o rascunho local a partir de uma inspeção do servidor (quando não
// há cópia local — ex.: criada via /iniciar ou iniciada em outro aparelho).
const reconstruirDraft = (id: string, insp: any): DraftLocal => {
  const respostas: Record<string, any> = {};
  (insp.respostas || []).forEach((r: any) => {
    respostas[r.itemId] = {
      status: r.status ?? undefined,
      observacao: r.observacao || '',
      responsavel: r.responsavel || '',
      valorNumerico: r.valorNumerico ?? undefined,
      valorTexto: r.valorTexto || '',
      certificadoId: r.certificadoId || '',
      certificadoValidade: r.certificadoValidade || '',
      fotoUrl: r.fotoUrl || undefined,
      fotosUrls: Array.isArray(r.fotosUrls) ? r.fotosUrls : [],
      pendenciaResolvida: r.pendenciaResolvida ?? undefined,
      fotoResolvidaUrl: r.fotoResolvidaUrl || undefined,
    };
  });
  const fotos = Array.isArray(insp.fotosUrls) ? insp.fotosUrls : [];
  return {
    id,
    metadata: {
      equipamentoId: insp.equipamentoId,
      tipo: insp.tipo,
      equipamentoTipo: insp.equipamento?.tipo,
      responsavelGeral: insp.responsavelGeral || '',
      compressorUtilizado: insp.compressorUtilizado || undefined,
      classificacao: insp.classificacao || undefined,
      origem: insp.origem || '',
      destino: insp.destino || '',
      equipamentoCodigo: insp.equipamento?.codigoExibicao || insp.equipamento?.codigo,
      equipamentoNome: insp.equipamento?.nome,
    },
    respostas,
    fotosEquipamento: [fotos[0], fotos[1], fotos[2]],
    materiaisUtilizados: (insp.materiais || []).map((m: any) => ({
      materialId: m.materialId,
      quantidade: m.quantidade,
      observacao: m.observacao || '',
      material: m.material,
    })),
    observacoesGerais: insp.observacoesGerais || '',
    currentStep: 0,
    dirty: false,
    localUpdatedAt: insp.updatedAt || new Date().toISOString(),
    modeloId: insp.modeloId || '',
    modeloVersao: insp.modeloVersao || 0,
    serverCreated: true,
  };
};

// Pre-fill answers with equipment certifications if available
const initResponses = (mod: ChecklistModelo, eq: Equipamento) => {
  const initialRespostas: Record<string, any> = {};
  const vencidos: Record<string, boolean> = {};
  const certs = eq.certificados || [];
  const certEslinga = certs.find(c => (c.tipo || '').toUpperCase() === 'ESLINGA');
  const certEquip = certs.find(c => (c.tipo || '').toUpperCase() === 'EQUIPAMENTO');
  const agora = new Date();

  mod.itens?.forEach(item => {
    let certId = '';
    let certValidade = '';
    if (item.tipo === 'CERTIFICADO') {
      const cert = /LINGADA/i.test(item.descricao) ? certEslinga : certEquip;
      if (cert) {
        certId = cert.numero || '';
        certValidade = fmtBR(cert.validade);
        if (cert.validade && new Date(cert.validade) < agora) vencidos[item.id] = true;
      }
    }
    initialRespostas[item.id] = {
      status: undefined,
      observacao: '',
      responsavel: '',
      valorNumerico: undefined,
      valorTexto: '',
      certificadoId: certId,
      certificadoValidade: certValidade,
      fotoUrl: undefined,
      pendenciaResolvida: undefined,
      fotoResolvidaUrl: undefined
    };
  });
  return { initialRespostas, vencidos };
};

export const ChecklistPreenchimento: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [metadata, setMetadata] = useState<any>(null);
  const [equipamento, setEquipamento] = useState<Equipamento | null>(null);
  const [modelo, setModelo] = useState<ChecklistModelo | null>(null);
  
  // Respostas e Materiais catalog
  const [respostas, setRespostas] = useState<Record<string, {
    status?: StatusItem;
    observacao: string;
    responsavel: string;
    valorNumerico?: number;
    valorTexto?: string;
    certificadoId?: string;
    certificadoValidade?: string;
    fotoUrl?: string;
    fotosUrls?: string[];
    pendenciaResolvida?: boolean;
    fotoResolvidaUrl?: string;
  }>>({});
  const [fotosEquipamento, setFotosEquipamento] = useState<(string | undefined)[]>([undefined, undefined, undefined]);
  const [materiaisDisponiveis, setMateriaisDisponiveis] = useState<Material[]>([]);
  const [materiaisUtilizados, setMateriaisUtilizados] = useState<any[]>([]);
  
  // Wizard Navigation State
  const [currentStep, setCurrentStep] = useState(0);
  const [showRespMap, setShowRespMap] = useState<Record<string, boolean>>({});
  const autoAdvanceTimeoutRef = useRef<any>(null);

  // Piloto After Cooler: roadmap das seções. blocoFoco = seção em preenchimento
  // (null = mostrando o roteiro). pins = seções fixadas pelo usuário (só local,
  // por aparelho — não muda nada no servidor nem para outros usuários).
  const [blocoFoco, setBlocoFoco] = useState<number | null>(null);
  const [pins, setPins] = useState<string[]>([]);

  // Adição de materiais local state
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialQty, setMaterialQty] = useState(1);
  const [materialObs, setMaterialObs] = useState('');
  
  // Observações gerais da inspeção
  const [observacoesGerais, setObservacoesGerais] = useState('');

  // Certificados pré-preenchidos do equipamento com validade vencida (alerta)
  const [certVencido, setCertVencido] = useState<Record<string, boolean>>({});

  // Canvas Signature ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [assinou, setAssinou] = useState(false); // houve traço na assinatura

  // Loading, Media Uploading and Video Recording State
  const [loading, setLoading] = useState(true);
  const [, setShowLongLoadingMessage] = useState(false);
  const [, setError] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [, setUploadingFoto] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [, setSavingCompleted] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const handleUploadFile = async (file: File | Blob, filename: string): Promise<string> => {
    try {
      setUploadingFoto(true);
      const url = await api.upload.file(file, filename);
      return url;
    } catch (err) {
      console.error(err);
      alert('Erro ao fazer upload do arquivo para o Google Drive. Tente novamente.');
      throw err;
    } finally {
      setUploadingFoto(false);
    }
  };

  const startVideoRecording = async (onComplete: (url: string) => void) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'video/webm' });
        try {
          const url = await handleUploadFile(blob, `video-${Date.now()}.webm`);
          onComplete(url);
        } catch (e) {
          alert('Erro ao fazer upload do vídeo.');
        } finally {
          setRecordingVideo(false);
          setMediaRecorder(null);
        }
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setRecordingVideo(true);
      
      // Auto-stop after 60 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 60000);
    } catch (err) {
      console.error(err);
      alert('Não foi possível acessar a câmera para gravar vídeo.');
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  };

  // Snapshot dos campos já enviados por item (para mandar só o que mudou).
  const lastSyncedRef = useRef<Record<string, string>>({});

  // Monta o payload granular de uma resposta (campos sempre explícitos:
  // valor normalizado ou null, para que limpar um campo também sincronize).
  const buildAlteracao = (itemId: string, value: any) => ({
    itemId,
    status: value.status ?? null,
    observacao: maiusculas(value.observacao) ?? null,
    responsavel: maiusculas(value.responsavel) ?? null,
    valorNumerico: value.valorNumerico ?? null,
    valorTexto: maiusculas(value.valorTexto) ?? null,
    certificadoId: maiusculas(value.certificadoId) ?? null,
    certificadoValidade: value.certificadoValidade || null,
    pendenciaResolvida: value.pendenciaResolvida ?? null,
    fotoUrl: value.fotoUrl || null,
    fotosUrls: Array.isArray(value.fotosUrls) ? value.fotosUrls : [],
    fotoResolvidaUrl: value.fotoResolvidaUrl || null,
  });

  // Sync granular: garante a inspeção no servidor (POST /iniciar, idempotente)
  // e envia via PATCH apenas os itens que mudaram desde o último sync.
  const syncDraftToServer = async (draftId: string) => {
    if (!navigator.onLine) return false;
    try {
      const raw = localStorage.getItem(`cme_draft_${draftId}`);
      if (!raw) return false;
      const draft = JSON.parse(raw);

      if (!draft.serverCreated) {
        await api.inspecoes.iniciar(draftId, {
          equipamentoId: draft.metadata.equipamentoId,
          tipo: draft.metadata.tipo,
          modeloId: draft.modeloId || undefined,
          modeloVersao: draft.modeloVersao || undefined,
          responsavelGeral: draft.metadata.responsavelGeral || undefined,
          origem: draft.metadata.origem || undefined,
          destino: draft.metadata.destino || undefined,
          compressorUtilizado: draft.metadata.compressorUtilizado || undefined,
          classificacao: draft.metadata.classificacao || undefined,
        });
        draft.serverCreated = true;
        localStorage.setItem(`cme_draft_${draftId}`, JSON.stringify(draft));
      }

      const alteracoes: any[] = [];
      const snaps: Record<string, string> = {};
      for (const [itemId, value] of Object.entries(draft.respostas || {})) {
        const payload = buildAlteracao(itemId, value);
        // Ignora itens vazios nunca sincronizados (evita criar respostas em
        // branco). Itens já sincronizados que ficaram vazios SÃO enviados
        // (para limpar no servidor).
        const { itemId: _omit, ...campos } = payload;
        const temConteudo = Object.values(campos).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null));
        if (!temConteudo && lastSyncedRef.current[itemId] === undefined) continue;

        const snap = JSON.stringify(payload);
        if (lastSyncedRef.current[itemId] !== snap) {
          alteracoes.push(payload);
          snaps[itemId] = snap;
        }
      }

      if (alteracoes.length > 0) {
        await api.inspecoes.patchRespostas(draftId, alteracoes);
        Object.assign(lastSyncedRef.current, snaps);
      }

      draft.dirty = false;
      localStorage.setItem(`cme_draft_${draftId}`, JSON.stringify(draft));
      return true;
    } catch (err) {
      console.warn('Failed to sync draft (granular):', err);
      return false;
    }
  };

  // Load long-loading indicator timer
  useEffect(() => {
    let t: any;
    if (loading) {
      t = setTimeout(() => {
        setShowLongLoadingMessage(true);
      }, 3000);
    } else {
      setShowLongLoadingMessage(false);
    }
    return () => clearTimeout(t);
  }, [loading]);

  // 1. Load/resume draft and bootstrap cache-first
  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    const loadDraftAndBootstrap = async () => {
      setLoading(true);
      setError('');

      let rawDraft = localStorage.getItem(`cme_draft_${id}`);

      // Sem cópia local: a inspeção pode existir só no servidor (criada via
      // /iniciar ou iniciada em outro aparelho). Reconstrói o rascunho local
      // a partir do servidor em vez de falhar.
      if (!rawDraft) {
        try {
          const insp: any = await api.inspecoes.get(id);
          if (!insp) throw new Error('not found');
          if (insp.status === 'CONCLUIDA' || insp.status === 'VALIDADA') {
            navigate(`/inspecao/${id}`);
            return;
          }
          const reconstruido = reconstruirDraft(id, insp);
          localStorage.setItem(`cme_draft_${id}`, JSON.stringify(reconstruido));
          const idsRaw = localStorage.getItem('cme_drafts');
          const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
          if (!ids.includes(id)) localStorage.setItem('cme_drafts', JSON.stringify([...ids, id]));
          rawDraft = JSON.stringify(reconstruido);
        } catch (e) {
          alert('Rascunho não encontrado.');
          navigate('/');
          return;
        }
      }

      let draft: DraftLocal;
      try {
        draft = JSON.parse(rawDraft);
      } catch (e) {
        alert('Erro ao carregar rascunho corrompido.');
        navigate('/');
        return;
      }

      setMetadata(draft.metadata);
      if (draft.currentStep !== undefined) setCurrentStep(draft.currentStep);
      if (draft.observacoesGerais !== undefined) setObservacoesGerais(draft.observacoesGerais);
      if (draft.fotosEquipamento !== undefined) setFotosEquipamento(draft.fotosEquipamento);
      if (draft.materiaisUtilizados !== undefined) setMateriaisUtilizados(draft.materiaisUtilizados);
      if (draft.respostas !== undefined) setRespostas(draft.respostas);

      const eqId = draft.metadata.equipamentoId;
      // O modelo de checklist é definido pelo TIPO DO EQUIPAMENTO
      // (Booster/Compressor/Membrana/After Cooler), não pelo tipo de inspeção.
      // Mantemos fallback para `metadata.tipo` apenas por compatibilidade com
      // rascunhos antigos (o servidor reforça usando eq.tipo de qualquer forma).
      const tipoConfiavel = draft.metadata.equipamentoTipo; // ausente = rascunho legado
      const eqTipo = tipoConfiavel || draft.metadata.tipo;

      const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day
      const isCacheValid = (key: string): boolean => {
        const cached = localStorage.getItem(key);
        if (!cached) return false;
        try {
          const { timestamp } = JSON.parse(cached);
          return Date.now() - timestamp < CACHE_TTL;
        } catch {
          return false;
        }
      };

      const getCached = (key: string) => {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        try {
          return JSON.parse(cached).data;
        } catch {
          return null;
        }
      };

      let loadedEq: Equipamento | null = null;
      let loadedModelo: ChecklistModelo | null = null;
      let loadedMaterials: Material[] = [];

      const isNewChecklist = !draft.modeloId;

      if (isNewChecklist) {
        const modelCacheKey = `cme_cache_modelo_${eqTipo}`;
        const matsCacheKey = `cme_cache_materiais`;

        // Rascunho legado (sem equipamentoTipo) cairia no fallback de tipo de
        // inspeção, colidindo o cache do modelo entre equipamentos diferentes.
        // Nesse caso ignoramos o cache de modelo e buscamos fresco no servidor
        // (que resolve pelo eq.tipo correto).
        const cacheValid = !!tipoConfiavel && isCacheValid(modelCacheKey) && isCacheValid(matsCacheKey);
        if (cacheValid) {
          loadedModelo = getCached(modelCacheKey);
          loadedMaterials = getCached(matsCacheKey);

          try {
            loadedEq = await api.equipamentos.get(eqId);
          } catch (e) {
            console.warn('Failed to fetch equipment details', e);
          }

          if (loadedModelo && loadedMaterials) {
            setModelo(loadedModelo);
            setMateriaisDisponiveis(loadedMaterials);
            if (loadedMaterials.length > 0) setSelectedMaterialId(loadedMaterials[0].id);
            
            if (loadedEq) {
              setEquipamento(loadedEq);
              const { initialRespostas, vencidos } = initResponses(loadedModelo, loadedEq);
              setRespostas(initialRespostas);
              setCertVencido(vencidos);
            }

            draft.modeloId = loadedModelo.id;
            draft.modeloVersao = loadedModelo.versao;
            localStorage.setItem(`cme_draft_${id}`, JSON.stringify(draft));

            setLoading(false);
            setDraftLoaded(true);

            api.checklist.bootstrap(eqId, eqTipo).then(data => {
              localStorage.setItem(`cme_cache_modelo_${eqTipo}`, JSON.stringify({ data: data.modelo, timestamp: Date.now() }));
              localStorage.setItem(`cme_cache_materiais`, JSON.stringify({ data: data.materiais, timestamp: Date.now() }));
            }).catch(err => console.warn('Background bootstrap update failed', err));

            return;
          }
        }

        try {
          const data = await api.checklist.bootstrap(eqId, eqTipo);
          loadedEq = data.equipamento;
          loadedModelo = data.modelo;
          loadedMaterials = data.materiais;

          // Só persiste o cache do modelo quando o tipo de equipamento é
          // confiável; rascunhos legados não devem gravar sob a chave de
          // tipo de inspeção (evita colisão entre equipamentos diferentes).
          if (loadedModelo && tipoConfiavel) {
            localStorage.setItem(`cme_cache_modelo_${eqTipo}`, JSON.stringify({ data: loadedModelo, timestamp: Date.now() }));
          }
          if (loadedMaterials) {
            localStorage.setItem(`cme_cache_materiais`, JSON.stringify({ data: loadedMaterials, timestamp: Date.now() }));
          }

          setEquipamento(loadedEq);
          setModelo(loadedModelo);
          setMateriaisDisponiveis(loadedMaterials);
          if (loadedMaterials && loadedMaterials.length > 0) setSelectedMaterialId(loadedMaterials[0].id);

          if (loadedModelo && loadedEq) {
            const { initialRespostas, vencidos } = initResponses(loadedModelo, loadedEq);
            setRespostas(initialRespostas);
            setCertVencido(vencidos);

            draft.modeloId = loadedModelo.id;
            draft.modeloVersao = loadedModelo.versao;
            localStorage.setItem(`cme_draft_${id}`, JSON.stringify(draft));
          }

          setLoading(false);
          setDraftLoaded(true);
        } catch (err: any) {
          console.error('Checklist bootstrap failed', err);
          setError(err.message || 'Erro de conexão com o servidor seguro.');
          setLoading(false);
        }
      } else {
        try {
          const eqPromise = api.equipamentos.get(eqId).catch(() => null);
          const modPromise = api.modelos.get(draft.modeloId).catch(() => {
            const modelCacheKey = `cme_cache_modelo_${eqTipo}`;
            const cachedMod = getCached(modelCacheKey);
            if (cachedMod && cachedMod.id === draft.modeloId) return cachedMod;
            return null;
          });
          const matsPromise = api.materiais.list().catch(() => getCached('cme_cache_materiais') || []);

          const [eq, mod, mats] = await Promise.all([eqPromise, modPromise, matsPromise]);

          if (eq) setEquipamento(eq);
          if (mod) setModelo(mod);
          if (mats) {
            setMateriaisDisponiveis(mats);
            if (mats.length > 0 && !selectedMaterialId) setSelectedMaterialId(mats[0].id);
          }

          setLoading(false);
          setDraftLoaded(true);
        } catch (err: any) {
          console.error('Loading locked checklist failed', err);
          setError('Erro ao carregar rascunho de checklist iniciado.');
          setLoading(false);
        }
      }
    };

    loadDraftAndBootstrap();
  }, [id, navigate]);

  // 2. Debounced save to localStorage
  useEffect(() => {
    if (!draftLoaded || !id || !metadata) return;

    const t = setTimeout(() => {
      const raw = localStorage.getItem(`cme_draft_${id}`);
      let currentDraft: any = {};
      if (raw) {
        try { currentDraft = JSON.parse(raw); } catch { /* ignore */ }
      }

      // Strip out base64 images from responses before saving to localStorage
      const cleanRespostas: Record<string, any> = {};
      Object.entries(respostas).forEach(([itemId, value]) => {
        const { fotoBase64, fotoResolvidaBase64, ...rest } = value as any;
        cleanRespostas[itemId] = rest;
      });

      const updatedDraft = {
        ...currentDraft,
        id,
        metadata,
        respostas: cleanRespostas,
        fotosEquipamento,
        materiaisUtilizados,
        observacoesGerais,
        currentStep,
        dirty: true, 
        localUpdatedAt: new Date().toISOString(),
      };

      localStorage.setItem(`cme_draft_${id}`, JSON.stringify(updatedDraft));
    }, 300);

    return () => clearTimeout(t);
  }, [respostas, fotosEquipamento, materiaisUtilizados, observacoesGerais, currentStep, draftLoaded, id, metadata]);

  // Semeia o snapshot de sync a partir de um rascunho já sincronizado
  // (evita reenviar todos os itens ao reabrir um rascunho limpo).
  useEffect(() => {
    if (!draftLoaded || !id) return;
    try {
      const raw = localStorage.getItem(`cme_draft_${id}`);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.serverCreated && !draft.dirty && draft.respostas) {
        Object.entries(draft.respostas).forEach(([itemId, value]) => {
          lastSyncedRef.current[itemId] = JSON.stringify(buildAlteracao(itemId, value as any));
        });
      }
    } catch {
      /* ignore */
    }
  }, [draftLoaded, id]);

  // Carrega as seções fixadas pelo usuário (local, por tipo de equipamento).
  useEffect(() => {
    if (!modelo) return;
    try {
      const raw = localStorage.getItem(`cme_pins_${modelo.tipoEquipamento || 'default'}`);
      if (raw) setPins(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [modelo]);

  // 3. Sync granular (debounce) quando as respostas mudam — salva campo a campo.
  useEffect(() => {
    if (!draftLoaded || !id) return;
    const t = setTimeout(() => {
      syncDraftToServer(id);
    }, 800);
    return () => clearTimeout(t);
  }, [respostas, draftLoaded, id]);

  // 4. Flush imediato quando o app vai para segundo plano ou reconecta.
  useEffect(() => {
    if (!draftLoaded || !id) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        syncDraftToServer(id);
      }
    };
    const handleOnline = () => {
      syncDraftToServer(id);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [draftLoaded, id]);

  // Canvas drawing event handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b'; // Slate 800
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setAssinou(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setAssinou(false);
  };

  // Toggle executante field trigger
  const toggleResp = (itemId: string) => {
    setShowRespMap(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Resposta status changer
  const handleStatusChange = (itemId: string, status: StatusItem) => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], status }
    }));
  };

  // Resposta comments/observações changer
  const handleObsChange = (itemId: string, observacao: string) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], observacao }
    }));
  };

  // Resposta executor changer
  const handleRespChange = (itemId: string, responsavel: string) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], responsavel }
    }));
  };

  // Resposta certificate ID changer
  const handleCertIdChange = (itemId: string, certificadoId: string) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], certificadoId }
    }));
  };

  // Resposta certificate validity changer
  const handleCertValidadeChange = (itemId: string, certificadoValidade: string) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], certificadoValidade }
    }));
  };

  // MEDICAO: valor numérico
  const handleValorNumerico = (itemId: string, valorNumerico: number | undefined) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], valorNumerico }
    }));
  };

  // TEXTO: valor texto
  const handleValorTexto = (itemId: string, valorTexto: string) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], valorTexto }
    }));
  };

  // Evidência por pergunta: 1 foto por toque, máximo 6.
  const handleAddFoto = async (itemId: string, file: File) => {
    const atuais = respostas[itemId]?.fotosUrls || [];
    if (atuais.length >= 6) {
      alert('Máximo de 6 fotos por pergunta.');
      return;
    }
    try {
      const url = await handleUploadFile(file, `evidencia-${itemId}-${Date.now()}.jpg`);
      setRespostas(prev => {
        const cur = prev[itemId]?.fotosUrls || [];
        if (cur.length >= 6) return prev;
        return { ...prev, [itemId]: { ...prev[itemId], fotosUrls: [...cur, url] } };
      });
    } catch {
      /* handleUploadFile já alerta o usuário */
    }
  };

  const handleRemoveFoto = (itemId: string, index: number) => {
    setRespostas(prev => {
      const cur = prev[itemId]?.fotosUrls || [];
      return { ...prev, [itemId]: { ...prev[itemId], fotosUrls: cur.filter((_, i) => i !== index) } };
    });
  };

  // Add Material to usage list
  const handleAddMaterial = () => {
    if (!selectedMaterialId) return;
    
    const alreadyAdded = materiaisUtilizados.find(m => m.materialId === selectedMaterialId);
    if (alreadyAdded) {
      alert('Este material já foi adicionado. Edite ou exclua da lista abaixo.');
      return;
    }

    const material = materiaisDisponiveis.find(m => m.id === selectedMaterialId);
    if (!material) return;

    setMateriaisUtilizados(prev => [
      ...prev,
      {
        materialId: selectedMaterialId,
        quantidade: materialQty,
        observacao: materialObs,
        material
      }
    ]);

    // Reset input fields
    setMaterialQty(1);
    setMaterialObs('');
  };

  // Remove Material from list
  const handleRemoveMaterial = (matId: string) => {
    setMateriaisUtilizados(prev => prev.filter(m => m.materialId !== matId));
  };

  // Save full Inspection as completed
  const handleSaveChecklist = async () => {
    if (!equipamento || !modelo || !id) return;
    setSavingCompleted(true);
    setError('');

    try {
      let assinaturaUrl: string | undefined;
      const canvas = canvasRef.current;
      if (canvas) {
        const blank = document.createElement('canvas');
        blank.width = canvas.width;
        blank.height = canvas.height;
        if (canvas.toDataURL() !== blank.toDataURL()) {
          try {
            setUploadingFoto(true);
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Canvas toBlob failed'));
              }, 'image/png');
            });
            assinaturaUrl = await handleUploadFile(blob, `assinatura-${Date.now()}.png`);
          } catch (e) {
            console.error('Failed to upload signature:', e);
            alert('Erro ao fazer upload da assinatura para o Google Drive.');
            setSavingCompleted(false);
            return;
          } finally {
            setUploadingFoto(false);
          }
        }
      }

      const finalRespostas = Object.entries(respostas).map(([itemId, value]) => ({
        id: `resp-${itemId}-${Date.now()}`,
        inspecaoId: id,
        itemId,
        status: value.status,
        observacao: value.observacao ? maiusculas(value.observacao) : undefined,
        responsavel: value.responsavel ? maiusculas(value.responsavel) : undefined,
        valorNumerico: value.valorNumerico,
        valorTexto: value.valorTexto ? maiusculas(value.valorTexto) : undefined,
        certificadoId: value.certificadoId ? maiusculas(value.certificadoId) : undefined,
        certificadoValidade: value.certificadoValidade || undefined,
        fotoUrl: value.fotoUrl || undefined,
        fotosUrls: value.fotosUrls && value.fotosUrls.length > 0 ? value.fotosUrls : undefined,
        pendenciaResolvida: value.pendenciaResolvida !== undefined ? value.pendenciaResolvida : undefined,
        fotoResolvidaUrl: value.fotoResolvidaUrl || undefined,
      }));

      const finalMateriais = materiaisUtilizados.map((mat, idx) => ({
        id: `mu-${idx}-${Date.now()}`,
        inspecaoId: id,
        materialId: mat.materialId,
        quantidade: mat.quantidade,
        observacao: mat.observacao || undefined,
      }));

      const novaInspecao: any = {
        id,
        equipamentoId: equipamento.id,
        tipo: metadata.tipo,
        data: new Date().toISOString(),
        modeloId: modelo.id,
        modeloVersao: modelo.versao,
        responsavelGeral: metadata.responsavelGeral,
        status: 'CONCLUIDA',
        observacoesGerais: observacoesGerais ? maiusculas(observacoesGerais) : undefined,
        assinaturaUrl: assinaturaUrl || undefined,
        respostas: finalRespostas,
        materiais: finalMateriais,
        origem: metadata.origem,
        destino: metadata.destino,
        compressorUtilizado: metadata.compressorUtilizado,
        classificacao: metadata.classificacao,
        fotosUrls: fotosEquipamento.filter((f): f is string => !!f),
      };

      await api.inspecoes.upsert(id, novaInspecao);

      localStorage.removeItem(`cme_draft_${id}`);
      const draftsRaw = localStorage.getItem('cme_drafts');
      const drafts: string[] = draftsRaw ? JSON.parse(draftsRaw) : [];
      const updatedDrafts = drafts.filter((d) => d !== id);
      localStorage.setItem('cme_drafts', JSON.stringify(updatedDrafts));

      alert('Inspeção concluída com sucesso e enviada ao servidor! ✅');
      navigate('/');
    } catch (err: any) {
      console.error('Failed to conclude checklist:', err);
      setError(err.message || 'Falha ao conectar com o servidor. A inspeção foi mantida como rascunho local.');
      alert('Falha no envio final. A inspeção permanecerá salva no seu painel como rascunho para re-envio.');
      setSavingCompleted(false);
    }
  };

  const handleBackToSelect = () => {
    navigate('/');
  };

  // Helper selectors for steps navigation
  const getSteps = () => {
    const list: { type: 'item' | 'materials' | 'pendencies' | 'equip_photos' | 'observations' | 'signature'; itemIndex?: number; label: string }[] = [];
    
    // 1. Checklist Items
    modelo?.itens?.forEach((item, index) => {
      list.push({
        type: 'item',
        itemIndex: index,
        label: `Item ${item.ordem}`
      });
    });
    
    // 2. Materials
    list.push({
      type: 'materials',
      label: 'Materiais'
    });
    
    // 3. Pendency Resolution (only if there are pending items)
    const temPendentes = Object.values(respostas).some(r => r.status === 'PENDENTE');
    if (temPendentes) {
      list.push({
        type: 'pendencies',
        label: 'Resolução de Pendências'
      });
    }
    
    // 4. Equipment Photos
    list.push({
      type: 'equip_photos',
      label: 'Fotos do Equipamento'
    });
    
    // 5. General Observations
    list.push({
      type: 'observations',
      label: 'Observações Gerais'
    });
    
    // 6. Signature
    list.push({
      type: 'signature',
      label: 'Assinatura'
    });
    
    return list;
  };

  const steps = getSteps();
  const totalSteps = steps.length;

  // Estado de um passo: 'concluida' (preenchido de verdade), 'pendente'
  // (obrigatório e ainda vazio) ou 'opcional' (não obrigatório e vazio).
  const stepStatus = (stepIndex: number): 'concluida' | 'pendente' | 'opcional' => {
    if (stepIndex < 0 || stepIndex >= steps.length) return 'opcional';
    const step = steps[stepIndex];

    if (step.type === 'item' && step.itemIndex !== undefined) {
      const item = modelo?.itens?.[step.itemIndex];
      if (!item) return 'opcional';
      const resp = respostas[item.id];
      const tipo = item.tipo || 'STATUS';
      let respondido = false;

      if (tipo === 'STATUS' || tipo === 'CERTIFICADO') {
        respondido = !!resp?.status;
        // Certificado com status OK exige a validade (ID é opcional).
        if (respondido && tipo === 'CERTIFICADO' && resp?.status === 'OK') {
          respondido = !!(resp.certificadoValidade && resp.certificadoValidade.trim());
        }
        // Pendente exige a observação do que está pendente.
        if (respondido && resp?.status === 'PENDENTE') {
          respondido = !!(resp.observacao && resp.observacao.trim());
        }
      } else if (tipo === 'MEDICAO') {
        respondido = resp?.valorNumerico !== undefined && resp?.valorNumerico !== null;
      } else if (tipo === 'TEXTO') {
        respondido = !!(resp?.valorTexto && resp.valorTexto.trim());
      }

      if (respondido) return 'concluida';
      return item.obrigatorio ? 'pendente' : 'opcional';
    }

    if (step.type === 'materials') {
      return materiaisUtilizados.length > 0 ? 'concluida' : 'opcional';
    }

    if (step.type === 'pendencies') {
      const pendingItems = modelo?.itens?.filter(it => respostas[it.id]?.status === 'PENDENTE') || [];
      const ok = pendingItems.every(it => {
        const r = respostas[it.id];
        return r && r.pendenciaResolvida !== undefined && !!r.fotoResolvidaUrl;
      });
      return ok ? 'concluida' : 'pendente';
    }

    if (step.type === 'equip_photos') {
      return fotosEquipamento.every(f => !!f) ? 'concluida' : 'pendente';
    }

    if (step.type === 'observations') {
      return observacoesGerais && observacoesGerais.trim() ? 'concluida' : 'opcional';
    }

    if (step.type === 'signature') {
      return assinou ? 'concluida' : 'opcional';
    }

    return 'opcional';
  };

  // Só libera avançar quando o passo não está pendente (obrigatório e vazio).
  const podeAvancar = (stepIndex: number): boolean => stepStatus(stepIndex) !== 'pendente';

  // Blocos navegáveis: uma entrada por seção do checklist + uma por etapa
  // final (materiais, pendências, fotos, observações, assinatura). `estado`:
  // 'concluida' (tudo preenchido), 'pendente' (falta obrigatório) ou 'opcional'.
  const blocos = (() => {
    const out: {
      label: string;
      stepIndex: number;
      estado: 'concluida' | 'pendente' | 'opcional';
      concluidas: number;
      total: number;
    }[] = [];
    let lastSecao: string | null = null;
    steps.forEach((s, idx) => {
      if (s.type === 'item' && s.itemIndex !== undefined) {
        const secao = modelo?.itens?.[s.itemIndex]?.secao || 'ITENS';
        if (secao !== lastSecao) {
          out.push({ label: secao, stepIndex: idx, estado: 'opcional', concluidas: 0, total: 0 });
          lastSecao = secao;
        }
      } else {
        out.push({ label: s.label, stepIndex: idx, estado: 'opcional', concluidas: 0, total: 0 });
        lastSecao = null;
      }
    });
    for (let i = 0; i < out.length; i++) {
      const start = out[i].stepIndex;
      const end = i + 1 < out.length ? out[i + 1].stepIndex : totalSteps;
      let concluidas = 0;
      let temPendente = false;
      for (let s = start; s < end; s++) {
        const st = stepStatus(s);
        if (st === 'concluida') concluidas++;
        else if (st === 'pendente') temPendente = true;
      }
      const total = end - start;
      out[i].concluidas = concluidas;
      out[i].total = total;
      out[i].estado = concluidas === total ? 'concluida' : temPendente ? 'pendente' : 'opcional';
    }
    return out;
  })();

  // Faixa de passos [start, end) de cada bloco/seção.
  const blocoRange = (i: number): [number, number] => [
    blocos[i].stepIndex,
    i + 1 < blocos.length ? blocos[i + 1].stepIndex : totalSteps,
  ];

  const togglePin = (label: string) => {
    setPins((prev) => {
      const next = prev.includes(label) ? prev.filter((p) => p !== label) : [...prev, label];
      try {
        localStorage.setItem(`cme_pins_${modelo?.tipoEquipamento || 'default'}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const progressPercentage = totalSteps > 0 ? Math.round(((currentStep + 1) / totalSteps) * 100) : 0;

  // Active step rendering logic (stepIndex permite reuso fora do wizard,
  // ex.: na layout de cartões/seções do piloto After Cooler).
  const renderStepContent = (stepIndex: number = currentStep) => {
    if (!modelo || steps.length === 0) return null;
    const step = steps[stepIndex];

    // Checklist Item step
    if (step.type === 'item' && step.itemIndex !== undefined) {
      const item = modelo.itens?.[step.itemIndex];
      if (!item) return null;
      const resp = respostas[item.id] || { status: undefined, observacao: '', responsavel: '', certificadoId: '', certificadoValidade: '', valorNumerico: undefined, valorTexto: '' };
      const tipo = item.tipo || 'STATUS';
      const isCert = tipo === 'CERTIFICADO';
      const isMedicao = tipo === 'MEDICAO';
      const isTexto = tipo === 'TEXTO';
      const showStatus = tipo === 'STATUS' || isCert;
      const totalItens = modelo.itens?.length || 0;

      const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
        STATUS: { label: 'Verificação', cls: 'bg-accent text-white' },
        CERTIFICADO: { label: 'Certificado', cls: 'bg-indigo-600 dark:bg-indigo-500 text-white' },
        MEDICAO: { label: 'Medição', cls: 'bg-sky-600 dark:bg-sky-500 text-white' },
        TEXTO: { label: 'Observação', cls: 'bg-slate-600 dark:bg-slate-500 text-white' },
      };
      const badge = TIPO_BADGE[tipo] || TIPO_BADGE.STATUS;

      return (
        <div className="space-y-4 w-full">
          {/* Section Indicator + tipo */}
          <div className="flex flex-wrap justify-center gap-2">
            <span className="bg-primary text-white text-[10px] font-extrabold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm text-center">
              {item.secao}
            </span>
            <span className={cn('text-[10px] font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm', badge.cls)}>
              {badge.label}
            </span>
          </div>

          {/* Card da pergunta + aba de evidência (extensão inferior centralizada) */}
          <div className="flex flex-col items-center w-full">
          <Card className="w-full">

            <div className="text-center space-y-4">
              <div>
                <span className="text-[10px] font-extrabold text-muted uppercase tracking-widest block mb-1">Item {item.ordem} de {totalItens}</span>
                <p className="text-sm font-extrabold text-content leading-relaxed">
                  {item.descricao}
                </p>
              </div>

              {/* CERTIFICADO: ID + Validade */}
              {isCert && (
                <div className="p-4 bg-surface-2 rounded-xl border border-border space-y-4 text-left">
                  <span className="block text-[9px] font-bold text-muted uppercase tracking-widest">Informações de Certificação</span>
                  {certVencido[item.id] && (
                    <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-[10px] font-bold px-2.5 py-1.5 rounded-lg">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Certificado do equipamento VENCIDO — verifique antes de liberar.
                    </div>
                  )}
                  <span className="block text-[9px] text-muted">Pré-preenchido do cadastro do equipamento (editável).</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[8px] font-bold text-muted mb-1">ID do Certificado</label>
                      <input
                        type="text"
                        placeholder="Ex: ID-10023"
                        className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50"
                        value={resp.certificadoId || ''}
                        onChange={(e) => handleCertIdChange(item.id, e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold text-muted mb-1">Validade do Certificado <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        placeholder="Ex: DD/MM/AAAA"
                        className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50"
                        value={resp.certificadoValidade || ''}
                        onChange={(e) => handleCertValidadeChange(item.id, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* MEDICAO: valor numérico + unidade */}
              {isMedicao && (
                <div className="p-4 bg-sky-50 dark:bg-sky-500/10 rounded-xl border border-sky-200 dark:border-sky-500/30 text-left">
                  <label className="block text-[9px] font-bold text-sky-700 dark:text-sky-300 uppercase tracking-widest mb-1.5">Leitura {item.unidade ? `(${item.unidade})` : ''}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder="0"
                      className="w-full px-3 py-2.5 border border-sky-200 dark:border-sky-500/30 rounded-lg text-base font-bold bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-sky-300/50"
                      value={resp.valorNumerico ?? ''}
                      onChange={(e) => handleValorNumerico(item.id, e.target.value === '' ? undefined : parseFloat(e.target.value))}
                    />
                    {item.unidade && <span className="text-sm font-extrabold text-sky-700 dark:text-sky-300">{item.unidade}</span>}
                  </div>
                </div>
              )}

              {/* TEXTO: observação livre */}
              {isTexto && (
                <div className="text-left">
                  <label className="block text-[9px] font-bold text-muted uppercase tracking-widest mb-1.5">Texto / Observação</label>
                  <textarea
                    rows={5}
                    placeholder="Descreva aqui..."
                    className="w-full p-3 border border-border rounded-lg text-xs bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50"
                    value={resp.valorTexto || ''}
                    onChange={(e) => handleValorTexto(item.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          </Card>

            {/* Aba de evidência: extensão inferior centralizada do card (mesma
                linguagem visual; conecta sem emenda via -mt-px + border-t-0) */}
            {(resp.fotosUrls?.length || 0) < 6 && (
              <label className="-mt-px cursor-pointer group" aria-label="Adicionar foto">
                <div className="flex items-center justify-center gap-1.5 px-8 py-2 bg-surface border border-t-0 border-border rounded-b-xl group-active:bg-surface-2 transition-colors">
                  <Camera className="h-[18px] w-[18px] text-content" />
                  {(resp.fotosUrls?.length || 0) > 0 && (
                    <span className="text-[11px] font-semibold text-muted">{resp.fotosUrls?.length}/6</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAddFoto(item.id, f);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {/* Thumbnails das evidências */}
          {(resp.fotosUrls?.length || 0) > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {(resp.fotosUrls || []).map((url, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={api.mediaUrl(url)}
                    alt={`Evidência ${idx + 1}`}
                    className="h-16 w-16 object-cover rounded-lg border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveFoto(item.id, idx)}
                    aria-label="Remover foto"
                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-1 shadow"
                  >
                    <Trash className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Status buttons — só STATUS e CERTIFICADO */}
          {showStatus && (
            <div className="grid grid-cols-3 gap-2">
              <StatusChip status="OK" selected={resp.status === 'OK'} onClick={() => handleStatusChange(item.id, 'OK')} />
              <StatusChip status="PENDENTE" selected={resp.status === 'PENDENTE'} onClick={() => handleStatusChange(item.id, 'PENDENTE')} />
              <StatusChip status="NAO_APLICAVEL" selected={resp.status === 'NAO_APLICAVEL'} onClick={() => handleStatusChange(item.id, 'NAO_APLICAVEL')} />
            </div>
          )}

          {/* Observações e Responsável — não para TEXTO (o próprio campo é a observação) */}
          {!isTexto && (
            <Card>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase mb-1">
                    Observações {resp.status === 'PENDENTE' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={resp.status === 'PENDENTE' ? "O que está pendente? (Obrigatório)..." : "Descreva observações do item (opcional)..."}
                    className={cn(
                      'w-full px-3 py-2.5 border rounded-lg text-xs bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50',
                      resp.status === 'PENDENTE' && !resp.observacao.trim() ? 'border-red-300 dark:border-red-500/50 focus:ring-red-200' : 'border-border'
                    )}
                    value={resp.observacao}
                    onChange={(e) => handleObsChange(item.id, e.target.value)}
                  />
                </div>

                {/* Adicionar Responsável */}
                <div className="pt-1">
                  {!showRespMap[item.id] && !resp.responsavel ? (
                    <button
                      type="button"
                      onClick={() => toggleResp(item.id)}
                      className="w-full text-center text-xs font-semibold text-accent-text hover:text-accent py-2.5 border border-dashed border-border rounded-lg bg-surface-2 transition min-h-[48px]"
                    >
                      + Adicionar Responsável (Executante)
                    </button>
                  ) : (
                    <div className="space-y-1.5 animate-slideDown">
                      <div className="flex justify-between items-center">
                        <label className="block text-[10px] font-bold text-muted uppercase">Responsável (Executante)</label>
                        <button
                          type="button"
                          onClick={() => {
                            handleRespChange(item.id, '');
                            toggleResp(item.id);
                          }}
                          className="text-[9px] text-red-500 hover:text-red-700 dark:hover:text-red-400 font-bold"
                        >
                          Remover
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Nome de quem executou a verificação"
                        className="w-full px-3 py-2.5 border border-border rounded-lg text-xs bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50"
                        value={resp.responsavel}
                        onChange={(e) => handleRespChange(item.id, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      );
    }

    // Materials Consumed step
    if (step.type === 'materials') {
      return (
        <div className="space-y-4 w-full">
          <Card title="Materiais Consumidos no Teste" subtitle="Materiais utilizados">
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Material</label>
                  <select
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-xs bg-surface text-content outline-none focus:ring-2 focus:ring-accent/50"
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(e.target.value)}
                  >
                    {materiaisDisponiveis.map(mat => (
                      <option key={mat.id} value={mat.id}>
                        {mat.codigo} - {mat.descricao} ({mat.unidade})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Qtd</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-xs text-center bg-surface text-content outline-none focus:ring-2 focus:ring-accent/50"
                      value={materialQty}
                      onChange={(e) => setMaterialQty(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Observações SKU</label>
                    <input
                      type="text"
                      placeholder="Troca preventiva..."
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-xs bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50"
                      value={materialObs}
                      onChange={(e) => setMaterialObs(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="w-full flex items-center justify-center gap-1.5 py-3 text-xs bg-surface-2 text-content border border-border rounded-xl hover:bg-surface-2/80 transition min-h-[48px] font-bold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Adicionar Material</span>
                </button>
              </div>

              {/* List of materials */}
              {materiaisUtilizados.length > 0 && (
                <div className="max-h-48 overflow-y-auto mt-4 pt-3 border-t border-border space-y-2">
                  <span className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Materiais Adicionados:</span>
                  <AnimatePresence>
                    {materiaisUtilizados.map(mat => (
                      <motion.div
                        key={mat.materialId}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="flex justify-between items-center bg-surface-2 border border-border p-2.5 rounded-xl text-xs"
                      >
                        <div className="flex-1 pr-2 min-w-0">
                          <span className="font-bold text-content block leading-tight truncate">{mat.material?.descricao}</span>
                          <span className="text-[10px] text-muted block mt-0.5 truncate">SKU: {mat.material?.codigo} &bull; Qtd: {mat.quantidade} {mat.material?.unidade}</span>
                          {mat.observacao && <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5 truncate">Nota: {mat.observacao}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterial(mat.materialId)}
                          className="p-2 text-muted hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </Card>
        </div>
      );
    }

    // Pendency Resolution step (Conditional)
    if (step.type === 'pendencies') {
      const pendingItems = modelo?.itens?.filter(it => respostas[it.id]?.status === 'PENDENTE') || [];
      return (
        <div className="space-y-4 w-full">
          <div className="text-center">
            <span className="bg-amber-500 text-white text-[10px] font-extrabold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm">
              Auditoria de Pendências
            </span>
            <h2 className="text-sm font-bold text-content mt-3">Resolução de Não Conformidades</h2>
            <p className="text-[11px] text-muted mt-1">Sinalize quais pendências foram resolvidas e anexe evidências.</p>
          </div>

          <div className="space-y-4 max-h-[50dvh] overflow-y-auto pr-1 no-scrollbar">
            {pendingItems.map(item => {
              const resp = respostas[item.id];
              return (
                <Card key={item.id}>
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-muted uppercase tracking-widest block">Item {item.ordem}</span>
                      <p className="text-xs font-bold text-content">{item.descricao}</p>
                      <p className="text-[11px] text-muted mt-1.5 italic bg-surface-2 p-2 border border-border rounded-lg">
                        <strong>Pendente:</strong> {resp.observacao}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-content">Pendência Resolvida?</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRespostas(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], pendenciaResolvida: true }
                              }));
                            }}
                            className={cn(
                              'px-4 py-2 rounded-lg text-xs font-extrabold transition-all min-h-[44px]',
                              resp.pendenciaResolvida === true
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-surface-2 text-content hover:bg-surface-2/80'
                            )}
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRespostas(prev => ({
                                ...prev,
                                [item.id]: { 
                                  ...prev[item.id], 
                                  pendenciaResolvida: false,
                                  fotoResolvidaBase64: undefined
                                }
                              }));
                            }}
                            className={cn(
                              'px-4 py-2 rounded-lg text-xs font-extrabold transition-all min-h-[44px]',
                              resp.pendenciaResolvida === false
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'bg-surface-2 text-content hover:bg-surface-2/80'
                            )}
                          >
                            Não
                          </button>
                        </div>
                      </div>

                      {/* Evidência obrigatória para toda pendência (resolvida ou não) */}
                      {resp.pendenciaResolvida !== undefined && (
                        <div className="flex flex-col items-center justify-center p-3 bg-surface-2 border border-dashed border-border rounded-xl">
                          <span className="text-[10px] font-bold text-muted mb-2 w-full text-left">
                            Evidência (foto/vídeo) <span className="text-red-500">*</span>
                          </span>
                          {resp.fotoResolvidaUrl ? (
                            <div className="relative inline-block">
                              {resp.fotoResolvidaUrl.includes('video-') || resp.fotoResolvidaUrl.endsWith('.webm') || resp.fotoResolvidaUrl.startsWith('data:video/') ? (
                                <video
                                  src={api.mediaUrl(resp.fotoResolvidaUrl)}
                                  controls
                                  className="h-24 w-40 object-cover rounded-lg border border-border shadow-sm"
                                />
                              ) : (
                                <img
                                  src={api.mediaUrl(resp.fotoResolvidaUrl)}
                                  alt="Reparo resolvido"
                                  className="h-24 w-40 object-cover rounded-lg border border-border shadow-sm"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setRespostas(prev => ({
                                    ...prev,
                                    [item.id]: { ...prev[item.id], fotoResolvidaUrl: undefined }
                                  }));
                                }}
                                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700"
                              >
                                <Trash size={12} />
                              </button>
                            </div>
                          ) : recordingVideo ? (
                            <div className="flex flex-col items-center justify-center p-3 w-full">
                              <div className="h-3.5 w-3.5 rounded-full bg-red-600 animate-pulse mb-2" />
                              <span className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-2">Gravando Vídeo (Máx 60s)...</span>
                              <button type="button" onClick={stopVideoRecording} className="bg-red-600 text-white hover:bg-red-700 text-[10px] py-2 px-4 rounded-lg font-bold min-h-[44px]">
                                Parar Gravação
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-around items-center w-full gap-4">
                              <label className="flex flex-col items-center justify-center cursor-pointer gap-1.5 py-3 flex-1 border border-dashed border-border rounded-xl hover:bg-surface bg-surface min-h-[64px]">
                                <Camera className="h-6 w-6 text-accent" />
                                <span className="text-[10px] font-bold text-accent-text uppercase">Tirar Foto</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const url = await handleUploadFile(file, `foto-reparo-${item.id}-${Date.now()}.jpg`);
                                      setRespostas(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], fotoResolvidaUrl: url }
                                      }));
                                    }
                                  }}
                                />
                              </label>
                              
                              <button
                                type="button"
                                onClick={() => startVideoRecording((url) => {
                                  setRespostas(prev => ({
                                    ...prev,
                                    [item.id]: { ...prev[item.id], fotoResolvidaUrl: url }
                                  }));
                                })}
                                className="flex flex-col items-center justify-center cursor-pointer gap-1.5 py-3 flex-1 border border-dashed border-border rounded-xl hover:bg-surface bg-surface min-h-[64px]"
                              >
                                <div className="h-6 w-6 text-red-600 rounded-full border-2 border-red-600 flex items-center justify-center font-bold text-[10px]">●</div>
                                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">Gravar Vídeo</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      );
    }

    // Equipment Photos step (3 mandatory photos/videos)
    if (step.type === 'equip_photos') {
      return (
        <div className="space-y-4 w-full">
          <div className="text-center">
            <span className="bg-primary text-white text-[10px] font-extrabold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm">
              Evidências Gerais
            </span>
            <h2 className="text-sm font-bold text-content mt-3">Evidências do Equipamento</h2>
            <p className="text-[11px] text-muted mt-1">Anexe exatamente 3 mídias (fotos ou vídeos) para liberação do equipamento.</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map(idx => {
              const label = idx === 0 ? 'Mídia 1' : idx === 1 ? 'Mídia 2' : 'Mídia 3';
              const foto = fotosEquipamento[idx];
              return (
                <div key={idx} className="bg-surface rounded-2xl border border-border p-3 flex flex-col items-center justify-center min-h-[140px] text-center shadow-sm space-y-2">
                  <span className="text-[9px] font-extrabold text-muted uppercase tracking-widest">{label}</span>
                  {foto ? (
                    <div className="relative w-full aspect-square flex items-center justify-center bg-surface-2 border border-border rounded-lg overflow-hidden">
                      {foto.includes('video-') || foto.endsWith('.webm') || foto.startsWith('data:video/') ? (
                        <video
                          src={api.mediaUrl(foto)}
                          controls
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={api.mediaUrl(foto)}
                          alt={label}
                          className="w-full h-full object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setFotosEquipamento(prev => {
                            const updated = [...prev];
                            updated[idx] = undefined;
                            return updated;
                          });
                        }}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700 active:scale-90"
                      >
                        <Trash size={10} />
                      </button>
                    </div>
                  ) : recordingVideo ? (
                    <div className="flex flex-col items-center justify-center p-2 w-full aspect-square">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse mb-1" />
                      <span className="text-[8px] font-bold text-red-600 dark:text-red-400 mb-1">Gravando...</span>
                      <button type="button" onClick={stopVideoRecording} className="bg-red-600 text-white text-[8px] py-1 px-2 rounded font-bold">
                        Parar
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col w-full aspect-square gap-1">
                      <label className="flex flex-col items-center justify-center border border-dashed border-border rounded-lg cursor-pointer bg-surface-2 hover:bg-surface-2/80 transition flex-1">
                        <Camera className="h-4 w-4 text-accent" />
                        <span className="text-[8px] font-bold text-accent-text uppercase mt-0.5">Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await handleUploadFile(file, `foto-equip-${idx}-${Date.now()}.jpg`);
                              setFotosEquipamento(prev => {
                                const updated = [...prev];
                                updated[idx] = url;
                                return updated;
                              });
                            }
                          }}
                        />
                      </label>
                      
                      <button
                        type="button"
                        onClick={() => startVideoRecording((url) => {
                          setFotosEquipamento(prev => {
                            const updated = [...prev];
                            updated[idx] = url;
                            return updated;
                          });
                        })}
                        className="flex flex-col items-center justify-center border border-dashed border-border rounded-lg cursor-pointer bg-surface-2 hover:bg-surface-2/80 transition flex-1 text-red-600"
                      >
                        <span className="text-[12px] font-bold">●</span>
                        <span className="text-[8px] font-bold text-red-600 dark:text-red-400 uppercase">Vídeo</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // General Observations step
    if (step.type === 'observations') {
      return (
        <div className="space-y-4 w-full">
          <Card title="Observações Gerais da Inspeção" subtitle="Observações da inspeção">
            <textarea
              rows={6}
              placeholder="Observações gerais (opcional)…"
              className="w-full p-3 border border-border rounded-lg text-xs bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50"
              value={observacoesGerais}
              onChange={(e) => setObservacoesGerais(e.target.value)}
            />
          </Card>
        </div>
      );
    }

    // Signature step
    if (step.type === 'signature') {
      return (
        <div className="space-y-5 w-full">
          <Card title="Assinatura do Inspetor" subtitle="Assine para concluir">
            <div className="space-y-3">
              <div className="border border-border rounded-xl overflow-hidden bg-white shadow-inner relative">
                <canvas
                  ref={canvasRef}
                  width={350}
                  height={140}
                  className="w-full h-32 touch-none block bg-white"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-muted italic">Assine com o dedo ou caneta touch</span>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="text-content font-bold hover:text-accent-text py-2 px-3 border border-border rounded-lg bg-surface active:scale-95 transition min-h-[40px]"
                >
                  Limpar Campo
                </button>
              </div>
            </div>
          </Card>

          <div className="bg-surface-2 border border-border rounded-2xl p-4 flex gap-3 text-xs text-content leading-normal">
            <ShieldCheck className="h-5 w-5 text-accent flex-shrink-0" />
            <p>
              Ao finalizar, esta inspeção será salva com o status <strong>Concluída</strong> e enviada ao Portal para validação.
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  // Nó do roadmap (piloto After Cooler): mostra a seção com progresso + pin.
  // Tocar entra no preenchimento normal (uma pergunta por vez) daquela seção.
  const renderBlocoCard = (i: number) => {
    const b = blocos[i];
    const [start] = blocoRange(i);
    const pinned = pins.includes(b.label);

    const badgeCls =
      b.estado === 'concluida'
        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
        : b.estado === 'pendente'
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          : 'bg-surface-2 text-muted';
    const legenda =
      b.estado === 'concluida'
        ? 'Concluída'
        : b.estado === 'pendente'
          ? `${b.concluidas} de ${b.total} preenchidos`
          : 'Opcional';

    return (
      <div
        key={i}
        role="button"
        tabIndex={0}
        onClick={() => {
          setCurrentStep(start);
          setBlocoFoco(i);
        }}
        className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-3 min-h-[68px] cursor-pointer active:scale-[0.99] active:bg-surface-2 transition"
      >
        <div className={cn('h-10 w-10 rounded-full grid place-items-center shrink-0 text-[10px] font-extrabold', badgeCls)}>
          {b.estado === 'concluida' ? <Check className="h-5 w-5" /> : `${b.concluidas}/${b.total}`}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-content leading-tight">{b.label}</p>
          <p className="text-[11px] text-muted mt-0.5">{legenda}</p>
        </div>
        <button
          type="button"
          aria-label={pinned ? 'Desafixar seção' : 'Fixar seção no topo'}
          onClick={(e) => { e.stopPropagation(); togglePin(b.label); }}
          className={cn(
            'h-11 w-11 rounded-xl grid place-items-center shrink-0 border transition',
            pinned ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted'
          )}
        >
          <Pin className="h-5 w-5" />
        </button>
        <ChevronRight className="h-5 w-5 text-muted shrink-0" />
      </div>
    );
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-bg text-content overflow-hidden select-none">
      {/* Header */}
      <AppHeader
        title="CHECK LIST OPERACIONAL DE LIBERAÇÃO"
        subtitle={`${equipamento?.codigo || ''} · ${metadata?.tipo?.replace('_', ' ') || ''}`}
        onBack={handleBackToSelect}
        progress={progressPercentage}
        progressLabel={`Passo ${currentStep + 1} de ${totalSteps}`}
      />

      {blocoFoco === null ? (
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
            <div className="max-w-md w-full mx-auto space-y-5 pb-6">
              {pins.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5 px-1">
                    <Pin className="h-3.5 w-3.5" /> Fixadas por você
                  </p>
                  {blocos.map((b, i) => (pins.includes(b.label) ? renderBlocoCard(i) : null))}
                </div>
              )}
              <div className="space-y-2.5">
                <p className="text-[11px] font-bold text-muted uppercase tracking-wider px-1">Roteiro do checklist</p>
                {blocos.map((b, i) => (pins.includes(b.label) ? null : renderBlocoCard(i)))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Barra da seção: "Roteiro" (retorno) sempre visível, sem rodapé fixo */}
            <div className="bg-surface border-b border-border px-3 py-2 flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setBlocoFoco(null)}
                aria-label="Voltar ao roteiro"
                className="flex items-center gap-1 text-xs font-bold text-content px-2 py-2 rounded-lg active:bg-surface-2 min-h-[40px]"
              >
                <ArrowLeft className="h-4 w-4" /> Roteiro
              </button>
              <span className="text-xs font-bold text-content truncate">{blocos[blocoFoco].label}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              <div className="max-w-md w-full mx-auto space-y-4 pb-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    variants={stepVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: 0.18 }}
                  >
                    {renderStepContent(currentStep)}
                  </motion.div>
                </AnimatePresence>

                {/* Navegação inline (no conteúdo, não no rodapé). Avançar só
                    aparece quando a pergunta está preenchida. */}
                {(() => {
                  const [fStart, fEnd] = blocoRange(blocoFoco);
                  const lastInBloco = currentStep >= fEnd - 1;
                  const isSig = fEnd >= totalSteps;
                  const liberado = podeAvancar(currentStep);
                  return (
                    <div className="flex items-center justify-between gap-3 pt-1">
                      {currentStep > fStart ? (
                        <button
                          type="button"
                          onClick={() => setCurrentStep(currentStep - 1)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs bg-surface-2 text-content border border-border rounded-xl font-bold min-h-[48px] active:scale-[0.98] transition"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Voltar</span>
                        </button>
                      ) : (
                        <div className="flex-1" />
                      )}
                      {!liberado ? (
                        <div className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 text-center px-2 min-h-[48px]">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                          <span>Preencha para avançar</span>
                        </div>
                      ) : isSig && lastInBloco ? (
                        <button
                          type="button"
                          onClick={handleSaveChecklist}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs bg-accent text-white hover:bg-accent/90 rounded-xl font-bold min-h-[48px] active:scale-[0.98] transition"
                        >
                          <Save className="h-4 w-4" />
                          <span>Finalizar</span>
                        </button>
                      ) : lastInBloco ? (
                        <button
                          type="button"
                          onClick={() => setBlocoFoco(null)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs bg-accent text-white hover:bg-accent/90 rounded-xl font-bold min-h-[48px] active:scale-[0.98] transition"
                        >
                          <Check className="h-4 w-4" />
                          <span>Concluir seção</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentStep(currentStep + 1)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs bg-accent text-white hover:bg-accent/90 rounded-xl font-bold min-h-[48px] active:scale-[0.98] transition"
                        >
                          <span>Avançar</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
};

export default ChecklistPreenchimento;