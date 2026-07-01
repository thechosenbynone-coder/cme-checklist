import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Save, Plus, Trash, ShieldCheck, ChevronRight, Camera, Pin, Check, ArrowLeft, X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { AppHeader } from '../components/ui/AppHeader';
import { ImageLightbox } from '../components/ui/ImageLightbox';
import { cn } from '../lib/cn';
import api from '../services/api';
import { Equipamento, ChecklistModelo, Material, StatusItem, maiusculas, IntegridadeReport } from '@cme/types';

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
  videoEquipamento?: string;
  materiaisUtilizados: any[];
  observacoesGerais: string;
  currentStep: number;
  dirty: boolean;
  localUpdatedAt: string;
  modeloId: string;
  modeloVersao: number;
  serverCreated?: boolean; // inspeção já criada no servidor (POST /iniciar)
  numeroDocumento?: string; // número rastreável atribuído pelo servidor no /iniciar
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
      videoUrl: r.videoUrl || undefined,
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
    numeroDocumento: insp.numeroDocumento || undefined,
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

// Lock por rascunho — evita disparar POST /iniciar duas vezes em paralelo
// (ex.: duas fotos anexadas rapidamente antes da primeira resposta chegar).
// Resolve com o numeroDocumento atribuído pelo servidor (ou o já salvo).
const inspecaoCreationLocks = new Map<string, Promise<string | undefined>>();

// Garante que a inspeção existe no servidor (POST /iniciar, idempotente) antes
// de qualquer operação que dependa dela lá — usada pelo upload de evidência
// (pasta por inspeção no Drive) e pelo autosync. Devolve o numeroDocumento
// rastreável pra exibição no app.
async function ensureInspecaoOnServer(draftId: string): Promise<string | undefined> {
  const existingLock = inspecaoCreationLocks.get(draftId);
  if (existingLock) return existingLock;

  const promise = (async () => {
    const raw = localStorage.getItem(`cme_draft_${draftId}`);
    if (!raw) return undefined;
    const draft = JSON.parse(raw);
    // Só pula quando já temos o número. Drafts criados antes desta feature têm
    // serverCreated=true mas numeroDocumento vazio — caem no /iniciar abaixo
    // (idempotente: devolve o registro existente já com o número).
    if (draft.serverCreated && draft.numeroDocumento) return draft.numeroDocumento as string | undefined;

    const insp = await api.inspecoes.iniciar(draftId, {
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
    // Só marca depois do sucesso confirmado pelo servidor — nunca otimista.
    // Relê o draft (pode ter mudado durante o await) antes de gravar.
    const atualRaw = localStorage.getItem(`cme_draft_${draftId}`);
    const atual = atualRaw ? JSON.parse(atualRaw) : draft;
    atual.serverCreated = true;
    if (insp?.numeroDocumento) atual.numeroDocumento = insp.numeroDocumento;
    localStorage.setItem(`cme_draft_${draftId}`, JSON.stringify(atual));
    return insp?.numeroDocumento as string | undefined;
  })().finally(() => {
    inspecaoCreationLocks.delete(draftId);
  });

  inspecaoCreationLocks.set(draftId, promise);
  return promise;
}

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
    videoUrl?: string;
    pendenciaResolvida?: boolean;
    fotoResolvidaUrl?: string;
  }>>({});
  const [fotosEquipamento, setFotosEquipamento] = useState<(string | undefined)[]>([undefined, undefined, undefined]);
  const [videoEquipamento, setVideoEquipamento] = useState<string | undefined>(undefined);

  // Preflight de conclusão (gate de integridade antes de fechar a inspeção).
  const payloadConclusaoRef = useRef<any>(null);
  const [preflightReport, setPreflightReport] = useState<IntegridadeReport | null>(null);
  const [showPreflight, setShowPreflight] = useState(false);

  // Feedback visual (toast). Sucesso/aviso somem sozinhos; erro persiste.
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const showFeedback = (type: 'success' | 'error' | 'warning', text: string) => setFeedbackMsg({ type, text });
  useEffect(() => {
    if (feedbackMsg && feedbackMsg.type !== 'error') {
      const t = setTimeout(() => setFeedbackMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedbackMsg]);
  const [materiaisDisponiveis, setMateriaisDisponiveis] = useState<Material[]>([]);
  const [materiaisUtilizados, setMateriaisUtilizados] = useState<any[]>([]);
  const [numeroDocumento, setNumeroDocumento] = useState<string | undefined>(undefined);
  
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
  const [showLongLoadingMessage, setShowLongLoadingMessage] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(''); // erro ao carregar checklist
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [, setUploadingFoto] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [, setSavingCompleted] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const handleUploadFile = async (file: File | Blob, filename: string): Promise<string> => {
    try {
      setUploadingFoto(true);
      if (!id) throw new Error('Inspeção inválida.');
      // Garante que a inspeção existe no servidor antes do upload — o servidor
      // usa numeroDocumento/equipamento dela para nomear a pasta de evidências.
      const num = await ensureInspecaoOnServer(id);
      if (num) setNumeroDocumento(num);
      const url = await api.upload.file(file, filename, id);
      return url;
    } catch (err) {
      console.error(err);
      // Único ponto de feedback do upload — os chamadores (foto, vídeo,
      // assinatura) não devem mostrar uma segunda mensagem para o mesmo erro.
      showFeedback('error', err instanceof Error ? err.message : 'Erro ao fazer upload do arquivo. Tente novamente.');
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
          // handleUploadFile já mostrou o banner de erro — não duplicar feedback.
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
    videoUrl: value.videoUrl || null,
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

      const num = await ensureInspecaoOnServer(draftId);
      if (num) setNumeroDocumento(num);
      // Se chegou aqui sem lançar, a inspeção existe no servidor — refletir no
      // objeto local (lido antes do ensure) pra não sobrescrever com um valor
      // desatualizado no localStorage.setItem no fim desta função.
      draft.serverCreated = true;
      if (num) draft.numeroDocumento = num;

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
      setBootstrapError('');

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
      if (draft.numeroDocumento) setNumeroDocumento(draft.numeroDocumento);
      if (draft.currentStep !== undefined) setCurrentStep(draft.currentStep);
      if (draft.observacoesGerais !== undefined) setObservacoesGerais(draft.observacoesGerais);
      if (draft.fotosEquipamento !== undefined) setFotosEquipamento(draft.fotosEquipamento);
      if (draft.videoEquipamento !== undefined) setVideoEquipamento(draft.videoEquipamento);
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
          setBootstrapError(err.message || 'Erro de conexão com o servidor seguro.');
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
          setBootstrapError('Erro ao carregar rascunho de checklist iniciado.');
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
        videoEquipamento,
        materiaisUtilizados,
        observacoesGerais,
        currentStep,
        dirty: true,
        localUpdatedAt: new Date().toISOString(),
      };

      localStorage.setItem(`cme_draft_${id}`, JSON.stringify(updatedDraft));
    }, 300);

    return () => clearTimeout(t);
  }, [respostas, fotosEquipamento, videoEquipamento, materiaisUtilizados, observacoesGerais, currentStep, draftLoaded, id, metadata]);

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
            // handleUploadFile já mostrou o banner de erro — não duplicar feedback.
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
        videoUrl: value.videoUrl || undefined,
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

      const basePayload: any = {
        id,
        equipamentoId: equipamento.id,
        tipo: metadata.tipo,
        data: new Date().toISOString(),
        modeloId: modelo.id,
        modeloVersao: modelo.versao,
        responsavelGeral: metadata.responsavelGeral,
        observacoesGerais: observacoesGerais ? maiusculas(observacoesGerais) : undefined,
        assinaturaUrl: assinaturaUrl || undefined,
        respostas: finalRespostas,
        materiais: finalMateriais,
        origem: metadata.origem,
        destino: metadata.destino,
        compressorUtilizado: metadata.compressorUtilizado,
        classificacao: metadata.classificacao,
        fotosUrls: fotosEquipamento.filter((f): f is string => !!f),
        videoUrl: videoEquipamento || undefined,
      };

      // 1. Persiste TUDO como EM_ANDAMENTO (reversível) — base do preflight.
      //    Se este passo falhar, paramos antes de calcular integridade.
      await api.inspecoes.upsert(id, { ...basePayload, status: 'EM_ANDAMENTO' });

      // 2. Integridade real (já com assinatura/fotos/vídeo no servidor).
      let report: IntegridadeReport | null = null;
      try {
        report = await api.inspecoes.integridade(id);
      } catch {
        report = null; // sem report não bloqueia — segue a conclusão.
      }

      // 3. Reprovado: abre o preflight com as pendências (não conclui ainda).
      if (report && !report.aprovado) {
        payloadConclusaoRef.current = basePayload;
        setPreflightReport(report);
        setShowPreflight(true);
        setSavingCompleted(false);
        return;
      }

      // 4. Aprovado (ou sem report): conclui.
      await finalizarConclusao(basePayload, false);
    } catch (err: any) {
      console.error('Failed to conclude checklist:', err);
      // Não sobrescrever bootstrapError — mostra feedback via banner, não sobrescreve form
      showFeedback('error', 'Erro ao salvar respostas. Verifique a conexão e tente novamente.');
      setSavingCompleted(false);
    }
  };

  // Finaliza a inspeção: grava status CONCLUIDA, limpa rascunho e navega.
  const finalizarConclusao = async (payload: any, comPendencias: boolean) => {
    setSavingCompleted(true);
    try {
      await api.inspecoes.upsert(payload.id, { ...payload, status: 'CONCLUIDA' });

      localStorage.removeItem(`cme_draft_${payload.id}`);
      const draftsRaw = localStorage.getItem('cme_drafts');
      const drafts: string[] = draftsRaw ? JSON.parse(draftsRaw) : [];
      localStorage.setItem('cme_drafts', JSON.stringify(drafts.filter((d) => d !== payload.id)));

      setShowPreflight(false);
      showFeedback(
        comPendencias ? 'warning' : 'success',
        comPendencias ? 'Inspeção concluída com pendências.' : 'Inspeção concluída com sucesso!'
      );
      setTimeout(() => navigate('/'), 1300);
    } catch (err: any) {
      console.error('Failed to finalize checklist:', err);
      showFeedback('error', err?.message || 'Falha no envio final. Mantida como rascunho para reenvio.');
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

  // Reconcilia currentStep sempre que o total de passos muda (modelo carrega,
  // ou a seção de "Resolução de Pendências" é inserida/removida) — evita um
  // índice salvo de uma sessão anterior apontar além do roteiro atual.
  useEffect(() => {
    if (totalSteps === 0) return;
    setCurrentStep((prev) => Math.min(Math.max(prev, 0), totalSteps - 1));
  }, [totalSteps]);

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
        // Não-aplicável exige justificativa na observação.
        if (respondido && resp?.status === 'NAO_APLICAVEL') {
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
        return r && r.pendenciaResolvida !== undefined && !!(r.fotoResolvidaUrl || r.videoUrl);
      });
      return ok ? 'concluida' : 'pendente';
    }

    if (step.type === 'equip_photos') {
      // Pelo menos uma evidência (foto ou vídeo) do equipamento.
      return (fotosEquipamento.some(f => !!f) || !!videoEquipamento) ? 'concluida' : 'pendente';
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

  const safeCurrentStep = totalSteps > 0 ? Math.min(Math.max(currentStep, 0), totalSteps - 1) : 0;
  const progressPercentage =
    totalSteps > 0 ? Math.min(100, Math.max(0, Math.round(((safeCurrentStep + 1) / totalSteps) * 100))) : 0;

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
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(url)}
                    aria-label={`Ampliar evidência ${idx + 1}`}
                    className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <img
                      src={api.mediaUrl(url)}
                      alt={`Evidência ${idx + 1}`}
                      className="h-16 w-16 object-cover rounded-lg border border-border"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveFoto(item.id, idx); }}
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
                    {resp.status === 'NAO_APLICAVEL' ? 'Justificativa' : 'Observações'}{' '}
                    {(resp.status === 'PENDENTE' || resp.status === 'NAO_APLICAVEL') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      resp.status === 'PENDENTE'
                        ? 'O que está pendente? (Obrigatório)...'
                        : resp.status === 'NAO_APLICAVEL'
                        ? 'Por que não se aplica? (Obrigatório)...'
                        : 'Descreva observações do item (opcional)...'
                    }
                    className={cn(
                      'w-full px-3 py-2.5 border rounded-lg text-xs bg-surface text-content placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-accent/50',
                      (resp.status === 'PENDENTE' || resp.status === 'NAO_APLICAVEL') && !resp.observacao.trim()
                        ? 'border-red-300 dark:border-red-500/50 focus:ring-red-200'
                        : 'border-border'
                    )}
                    value={resp.observacao}
                    onChange={(e) => handleObsChange(item.id, e.target.value)}
                  />
                  {resp.status === 'NAO_APLICAVEL' && !resp.observacao.trim() && (
                    <p className="text-[9px] text-red-500 font-semibold mt-1">Justificativa obrigatória para itens não aplicáveis.</p>
                  )}
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
                          {(resp.fotoResolvidaUrl || resp.videoUrl) ? (
                            <div className="flex flex-wrap gap-2 w-full">
                              {resp.fotoResolvidaUrl && (
                                <div className="relative inline-block">
                                  <button
                                    type="button"
                                    onClick={() => setLightboxUrl(resp.fotoResolvidaUrl!)}
                                    aria-label="Ampliar foto do reparo"
                                    className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                                  >
                                    <img
                                      src={api.mediaUrl(resp.fotoResolvidaUrl)}
                                      alt="Reparo resolvido (foto)"
                                      className="h-24 w-40 object-cover rounded-lg border border-border shadow-sm"
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setRespostas(prev => ({ ...prev, [item.id]: { ...prev[item.id], fotoResolvidaUrl: undefined } })); }}
                                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700"
                                  >
                                    <Trash size={12} />
                                  </button>
                                </div>
                              )}
                              {resp.videoUrl && (
                                <div className="relative inline-block">
                                  <video
                                    src={api.mediaUrl(resp.videoUrl)}
                                    controls
                                    className="h-24 w-40 object-cover rounded-lg border border-border shadow-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setRespostas(prev => ({ ...prev, [item.id]: { ...prev[item.id], videoUrl: undefined } }))}
                                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700"
                                  >
                                    <Trash size={12} />
                                  </button>
                                </div>
                              )}
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
                                    [item.id]: { ...prev[item.id], videoUrl: url }
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
            <p className="text-[11px] text-muted mt-1">Anexe fotos do equipamento e, opcionalmente, um vídeo.</p>
          </div>

          {/* Fotos (3 slots — somente foto) */}
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map(idx => {
              const label = `Foto ${idx + 1}`;
              const foto = fotosEquipamento[idx];
              return (
                <div key={idx} className="bg-surface rounded-2xl border border-border p-3 flex flex-col items-center justify-center min-h-[140px] text-center shadow-sm space-y-2">
                  <span className="text-[9px] font-extrabold text-muted uppercase tracking-widest">{label}</span>
                  {foto ? (
                    <div className="relative w-full aspect-square flex items-center justify-center bg-surface-2 border border-border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(foto)}
                        aria-label={`Ampliar ${label}`}
                        className="block w-full h-full focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        <img src={api.mediaUrl(foto)} alt={label} className="w-full h-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
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
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full aspect-square border border-dashed border-border rounded-lg cursor-pointer bg-surface-2 hover:bg-surface-2/80 transition">
                      <Camera className="h-5 w-5 text-accent" />
                      <span className="text-[8px] font-bold text-accent-text uppercase mt-0.5">Tirar Foto</span>
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
                  )}
                </div>
              );
            })}
          </div>

          {/* Vídeo do equipamento (opcional, dedicado — separado das fotos) */}
          <div className="bg-surface rounded-2xl border border-border p-3 shadow-sm">
            <span className="text-[9px] font-extrabold text-muted uppercase tracking-widest block mb-2">Vídeo do Equipamento (opcional)</span>
            {videoEquipamento ? (
              <div className="relative w-full">
                <video src={api.mediaUrl(videoEquipamento)} controls className="w-full max-h-52 object-cover rounded-lg border border-border" />
                <button
                  type="button"
                  onClick={() => setVideoEquipamento(undefined)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700 active:scale-90"
                >
                  <Trash size={12} />
                </button>
              </div>
            ) : recordingVideo ? (
              <div className="flex flex-col items-center justify-center p-4">
                <div className="h-3 w-3 rounded-full bg-red-600 animate-pulse mb-2" />
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-2">Gravando Vídeo (Máx 60s)...</span>
                <button type="button" onClick={stopVideoRecording} className="bg-red-600 text-white text-[10px] py-2 px-4 rounded-lg font-bold min-h-[44px]">
                  Parar Gravação
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startVideoRecording((url) => setVideoEquipamento(url))}
                className="flex items-center justify-center gap-2 w-full py-3 border border-dashed border-border rounded-lg bg-surface-2 hover:bg-surface-2/80 transition text-red-600 min-h-[56px]"
              >
                <span className="text-[14px] font-bold">●</span>
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">Gravar Vídeo</span>
              </button>
            )}
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

  // Enquanto o roteiro real (modelo) ainda não chegou, não renderizar o
  // header de progresso nem o roteiro — antes disso, getSteps() só via as
  // seções fixas (Materiais/Fotos/Observações/Assinatura), o que produzia um
  // contador incoerente ("Passo 17 de 4") e um flash de lista errada.
  if (loading) {
    return (
      <div className="h-[100dvh] flex flex-col bg-bg text-content overflow-hidden select-none">
        <AppHeader title="CHECK LIST OPERACIONAL DE LIBERAÇÃO" onBack={handleBackToSelect} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-xs text-muted font-semibold uppercase tracking-wider">Carregando roteiro do checklist...</p>
          {showLongLoadingMessage && (
            <p className="text-xs text-muted">Isso está demorando mais que o normal. Verifique sua conexão.</p>
          )}
        </div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="h-[100dvh] flex flex-col bg-bg text-content overflow-hidden select-none">
        <AppHeader title="CHECK LIST OPERACIONAL DE LIBERAÇÃO" onBack={handleBackToSelect} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-xs p-4 rounded-xl flex items-start gap-2 max-w-sm">
            <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>{bootstrapError}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-accent text-white font-bold text-xs px-4 py-2.5 rounded-xl min-h-[44px] active:scale-[0.98] transition hover:bg-accent/90"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={handleBackToSelect}
              className="border border-border text-content font-bold text-xs px-4 py-2.5 rounded-xl min-h-[44px] active:scale-[0.98] transition"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!modelo || !modelo.itens || modelo.itens.length === 0) {
    return (
      <div className="h-[100dvh] flex flex-col bg-bg text-content overflow-hidden select-none">
        <AppHeader title="CHECK LIST OPERACIONAL DE LIBERAÇÃO" onBack={handleBackToSelect} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm text-content font-semibold">
            Nenhum roteiro de checklist configurado para este tipo de equipamento.
          </p>
          <p className="text-xs text-muted">Contate o gestor responsável.</p>
          <button
            type="button"
            onClick={handleBackToSelect}
            className="bg-accent text-white font-bold text-xs px-4 py-2.5 rounded-xl min-h-[44px] active:scale-[0.98] transition hover:bg-accent/90 mt-2"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-bg text-content overflow-hidden select-none">
      {/* Header */}
      <AppHeader
        title="CHECK LIST OPERACIONAL DE LIBERAÇÃO"
        subtitle={`${equipamento?.codigo || ''} · ${metadata?.tipo?.replace('_', ' ') || ''}${numeroDocumento ? ` · ${numeroDocumento}` : ''}`}
        onBack={handleBackToSelect}
        progress={progressPercentage}
        progressLabel={`Passo ${safeCurrentStep + 1} de ${totalSteps}`}
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

              {/* Navegação inline (no conteúdo, sem rodapé fixo): "Roteiro"
                  (retorno) sempre visível; "Avançar" só quando preenchido. */}
              {(() => {
                const [, fEnd] = blocoRange(blocoFoco);
                const lastInBloco = currentStep >= fEnd - 1;
                const isSig = fEnd >= totalSteps;
                const liberado = podeAvancar(currentStep);
                return (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setBlocoFoco(null)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs bg-surface-2 text-content border border-border rounded-xl font-bold min-h-[48px] active:scale-[0.98] transition"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Roteiro</span>
                    </button>
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
        )
      }

      {/* Toast de feedback (sucesso/aviso/erro) */}
      <AnimatePresence>
        {feedbackMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 inset-x-4 z-[120] flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-lg text-xs font-bold"
            style={{
              backgroundColor:
                feedbackMsg.type === 'success' ? '#dcfce7' : feedbackMsg.type === 'warning' ? '#fef3c7' : '#fee2e2',
              color:
                feedbackMsg.type === 'success' ? '#15803d' : feedbackMsg.type === 'warning' ? '#b45309' : '#b91c1c',
            }}
          >
            <span className="flex items-center gap-2">
              {feedbackMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : feedbackMsg.type === 'warning' ? <AlertTriangle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {feedbackMsg.text}
            </span>
            <button onClick={() => setFeedbackMsg(null)} className="opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preflight: bottom sheet com as pendências antes de concluir */}
      <AnimatePresence>
        {showPreflight && preflightReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50"
            onClick={() => { setShowPreflight(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="bg-surface w-full max-w-lg rounded-t-3xl p-5 safe-bottom-p5 space-y-4 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="text-sm font-extrabold text-content">Inspeção com pendências</h3>
              </div>
              <p className="text-[11px] text-muted">
                Esta inspeção ainda tem itens ou evidências faltando. Você pode voltar e corrigir ou concluir mesmo assim —
                mas inspeções com pendências <strong>não poderão ser validadas pelo gestor</strong>.
              </p>

              {/* Status gerais */}
              <div className="space-y-1.5">
                <div className={cn('flex items-center gap-2 text-[11px] font-semibold', preflightReport.temAssinatura ? 'text-green-600' : 'text-red-500')}>
                  {preflightReport.temAssinatura ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {preflightReport.temAssinatura ? 'Assinatura registrada' : 'Assinatura ausente'}
                </div>
                <div className={cn('flex items-center gap-2 text-[11px] font-semibold', preflightReport.temFotosOuVideoEquipamento ? 'text-green-600' : 'text-red-500')}>
                  {preflightReport.temFotosOuVideoEquipamento ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {preflightReport.temFotosOuVideoEquipamento ? 'Fotos/vídeo do equipamento' : 'Sem foto/vídeo do equipamento'}
                </div>
              </div>

              {preflightReport.itensObrigatoriosPendentes.length > 0 && (
                <div>
                  <span className="block text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">
                    Itens obrigatórios ({preflightReport.itensObrigatoriosPendentes.length})
                  </span>
                  <ul className="space-y-1">
                    {preflightReport.itensObrigatoriosPendentes.map((it) => (
                      <li key={it.itemId} className="text-[11px] text-red-600 bg-red-500/5 border border-red-500/20 rounded-lg px-2 py-1">
                        <span className="font-bold">{it.secao}:</span> {it.descricao}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preflightReport.evidenciasFaltantes.length > 0 && (
                <div>
                  <span className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">
                    Evidências faltantes ({preflightReport.evidenciasFaltantes.length})
                  </span>
                  <ul className="space-y-1">
                    {preflightReport.evidenciasFaltantes.map((ev) => (
                      <li key={ev.itemId} className="text-[11px] text-amber-700 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2 py-1">
                        {ev.descricao} — <span className="italic">{ev.motivo}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preflightReport.certificadosVencidos.length > 0 && (
                <div>
                  <span className="block text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">
                    Certificados vencidos ({preflightReport.certificadosVencidos.length})
                  </span>
                  <ul className="space-y-1">
                    {preflightReport.certificadosVencidos.map((c) => (
                      <li key={c.itemId} className="text-[11px] text-red-600 bg-red-500/5 border border-red-500/20 rounded-lg px-2 py-1">
                        {c.descricao}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPreflight(false)}
                  className="flex-1 py-3 rounded-xl bg-accent text-white font-bold text-xs min-h-[48px] active:scale-[0.98] transition"
                >
                  Voltar e corrigir
                </button>
                <button
                  type="button"
                  onClick={() => { if (payloadConclusaoRef.current) finalizarConclusao(payloadConclusaoRef.current, true); }}
                  className="flex-1 py-3 rounded-xl bg-surface-2 text-content border border-border font-bold text-xs min-h-[48px] active:scale-[0.98] transition"
                >
                  Concluir mesmo assim
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox: ampliar foto de evidência ao tocar na miniatura */}
      <AnimatePresence>
        {lightboxUrl && (
          <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChecklistPreenchimento;