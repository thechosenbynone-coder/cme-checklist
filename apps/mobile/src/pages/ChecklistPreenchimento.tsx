import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, AlertTriangle, HelpCircle, Save, Plus, Trash, ShieldCheck, ChevronRight, ChevronLeft, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { StatusChip } from '../components/ui/StatusChip';
import { AppHeader } from '../components/ui/AppHeader';
import { cn } from '../lib/cn';
import api from '../services/api';
import { Equipamento, ChecklistModelo, Material, Inspecao, RespostaItem, MaterialUtilizado, StatusItem, maiusculas } from '@cme/types';

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

export const ChecklistPreenchimento: React.FC = () => {
  const navigate = useNavigate();
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
    fotoBase64?: string;
    fotoUrl?: string;
    pendenciaResolvida?: boolean;
    fotoResolvidaBase64?: string;
    fotoResolvidaUrl?: string;
  }>>({});
  const [fotosEquipamento, setFotosEquipamento] = useState<(string | undefined)[]>([undefined, undefined, undefined]);
  const [materiaisDisponiveis, setMateriaisDisponiveis] = useState<Material[]>([]);
  const [materiaisUtilizados, setMateriaisUtilizados] = useState<Omit<MaterialUtilizado, 'id' | 'inspecaoId'>[]>([]);
  
  // Wizard Navigation State
  const [currentStep, setCurrentStep] = useState(0);
  const [showRespMap, setShowRespMap] = useState<Record<string, boolean>>({});
  const autoAdvanceTimeoutRef = useRef<any>(null);

  
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

  // Loading, Media Uploading and Video Recording State
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
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


  useEffect(() => {
    // 1. Carregar metadados da sessão
    const metaRaw = window.sessionStorage.getItem('cme_nova_inspecao_meta');
    if (!metaRaw) {
      navigate('/');
      return;
    }
    const meta = JSON.parse(metaRaw);
    setMetadata(meta);

    // 2. Carregar Equipamento (com certificados, para pré-preenchimento)
    api.equipamentos.get(meta.equipamentoId).then(eq => {
      if (eq) {
        setEquipamento(eq);
        const certs = eq.certificados || [];
        const certEslinga = certs.find(c => (c.tipo || '').toUpperCase() === 'ESLINGA');
        const certEquip = certs.find(c => (c.tipo || '').toUpperCase() === 'EQUIPAMENTO');
        const agora = new Date();

        // 3. Carregar Modelo correspondente
        api.modelos.getPorTipo(eq.tipo).then(mod => {
          if (mod) {
            setModelo(mod);
            const initialRespostas: typeof respostas = {};
            const vencidos: Record<string, boolean> = {};
            mod.itens?.forEach(item => {
              let certId = '';
              let certValidade = '';
              if (item.tipo === 'CERTIFICADO') {
                // Lingada usa o certificado da eslinga; demais usam o certificado do equipamento.
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
                fotoBase64: undefined,
                fotoUrl: undefined,
                pendenciaResolvida: undefined,
                fotoResolvidaBase64: undefined,
                fotoResolvidaUrl: undefined
              };
            });
            setRespostas(initialRespostas);
            setCertVencido(vencidos);
          }
        });
      }
    });

    // 4. Carregar Materiais para o seletor
    api.materiais.list().then(mats => {
      setMateriaisDisponiveis(mats);
      if (mats.length > 0) {
        setSelectedMaterialId(mats[0].id);
      }
    });
  }, [navigate]);

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

  // Save full Inspection
  const handleSaveChecklist = async () => {
    if (!equipamento || !modelo) return;

    // Obter assinatura e fazer upload
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
          return;
        } finally {
          setUploadingFoto(false);
        }
      }
    }

    const inspecaoId = `insp-${Date.now()}`;

    // Mapear respostas estruturadas para o tipo
    const finalRespostas: RespostaItem[] = Object.entries(respostas).map(([itemId, value]) => ({
      id: `resp-${itemId}-${Date.now()}`,
      inspecaoId,
      itemId,
      status: value.status,
      observacao: maiusculas(value.observacao),
      responsavel: maiusculas(value.responsavel),
      valorNumerico: value.valorNumerico,
      valorTexto: maiusculas(value.valorTexto),
      certificadoId: maiusculas(value.certificadoId),
      certificadoValidade: value.certificadoValidade || undefined,
      fotoUrl: value.fotoUrl || undefined,
      pendenciaResolvida: value.pendenciaResolvida !== undefined ? value.pendenciaResolvida : undefined,
      fotoResolvidaUrl: value.fotoResolvidaUrl || undefined,
    }));

    // Mapear materiais
    const finalMateriais: MaterialUtilizado[] = materiaisUtilizados.map((mat, idx) => ({
      id: `mu-${idx}-${Date.now()}`,
      inspecaoId,
      materialId: mat.materialId,
      quantidade: mat.quantidade,
      observacao: mat.observacao || undefined,
    }));

    const novaInspecao: Inspecao = {
      id: inspecaoId,
      equipamentoId: equipamento.id,
      tipo: metadata.tipo,
      data: new Date().toISOString(),
      modeloId: modelo.id,
      modeloVersao: modelo.versao,
      responsavelGeral: metadata.responsavelGeral,
      status: 'CONCLUIDA',
      observacoesGerais: maiusculas(observacoesGerais),
      assinaturaUrl: assinaturaUrl || undefined,
      respostas: finalRespostas,
      materiais: finalMateriais,
      origem: metadata.origem,
      destino: metadata.destino,
      compressorUtilizado: metadata.compressorUtilizado,
      classificacao: metadata.classificacao,
      fotosEquipamento: fotosEquipamento.filter((f): f is string => !!f)
    };

    await api.inspecoes.save(novaInspecao);
    
    window.sessionStorage.removeItem('cme_nova_inspecao_meta');
    alert('Inspeção concluída com sucesso e enviada ao servidor local! ✅');
    navigate('/');
  };

  const handleBackToSelect = () => {
    if (window.confirm('Deseja realmente voltar? As respostas preenchidas serão perdidas.')) {
      window.sessionStorage.removeItem('cme_nova_inspecao_meta');
      navigate('/');
    }
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

  function goToNextStep(bypassValidation: boolean | any = false) {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const step = steps[currentStep];
    const shouldBypass = bypassValidation === true;
    if (!shouldBypass && step.type === 'item' && step.itemIndex !== undefined) {
      const item = modelo?.itens?.[step.itemIndex];
      if (item) {
        const resp = respostas[item.id];
        const tipo = item.tipo || 'STATUS';
        const exigeStatus = tipo === 'STATUS' || tipo === 'CERTIFICADO';

        // MEDICAO/TEXTO não têm status — avanço livre (opcionais).
        if (exigeStatus) {
          if (!resp || !resp.status) {
            alert('Por favor, selecione uma opção (OK, Pendente ou N/A) para este item antes de avançar.');
            return;
          }

          // Certificado com status OK exige a validade (ID é opcional).
          if (tipo === 'CERTIFICADO' && resp.status === 'OK') {
            const hasVal = resp.certificadoValidade && resp.certificadoValidade.trim();
            if (!hasVal) {
              alert('Por favor, preencha a Validade do certificado para este item antes de avançar.');
              return;
            }
          }

          if (resp.status === 'PENDENTE' && (!resp.observacao || !resp.observacao.trim())) {
            alert('Atenção: Ao marcar como Pendente, você deve detalhar o problema no campo de Observação.');
            return;
          }
        }
      }
    } else if (step.type === 'pendencies') {
      const pendingItems = modelo?.itens?.filter(it => respostas[it.id]?.status === 'PENDENTE') || [];
      for (const item of pendingItems) {
        const resp = respostas[item.id];
        if (resp.pendenciaResolvida === undefined) {
          alert(`Por favor, indique se a pendência do item "${item.descricao}" foi resolvida.`);
          return;
        }
        // Toda pendência exige evidência (foto/vídeo), resolvida ou não.
        if (!resp.fotoResolvidaUrl) {
          alert(`Anexe a evidência (foto/vídeo) da pendência do item "${item.descricao}".`);
          return;
        }
      }
    } else if (step.type === 'equip_photos') {
      const todasPreenchidas = fotosEquipamento.every(f => !!f);
      if (!todasPreenchidas) {
        alert('Por favor, anexe as 3 fotos obrigatórias do equipamento antes de prosseguir.');
        return;
      }
    }

    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  }

  const goToPrevStep = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };


  const progressPercentage = totalSteps > 0 ? Math.round(((currentStep + 1) / totalSteps) * 100) : 0;

  // Active step rendering logic
  const renderStepContent = () => {
    if (!modelo || steps.length === 0) return null;
    const step = steps[currentStep];

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

          {/* Item Description Card */}
          <Card>
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
          <Card title="Materiais Consumidos no Teste" subtitle="Selecione e registre materiais utilizados no After Cooler">
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
          <Card title="Observações Gerais da Inspeção" subtitle="Comentários adicionais referentes ao teste ou condições do After Cooler">
            <textarea
              rows={6}
              placeholder="Descreva observações gerais referentes ao teste dinâmico de troca de temperatura ou outros eventos operacionais..."
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
          <Card title="Assinatura do Inspetor" subtitle="Assine abaixo para encerrar e certificar o checklist">
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

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center min-h-0 no-scrollbar">
        <div className="max-w-md w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.18 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="bg-surface border-t border-border p-4 shadow-lg flex-shrink-0 z-50 safe-bottom">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goToPrevStep}
            disabled={currentStep === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs bg-surface-2 text-content border border-border rounded-xl font-bold transition min-h-[48px] disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Voltar</span>
          </button>

          {currentStep === totalSteps - 1 ? (
            <motion.button
              type="button"
              onClick={handleSaveChecklist}
              whileTap={{ scale: 0.98 }}
              className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs bg-accent text-white hover:bg-accent/90 rounded-xl font-bold transition min-h-[48px]"
            >
              <Save className="h-4 w-4" />
              <span>Finalizar</span>
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={goToNextStep}
              whileTap={{ scale: 0.98 }}
              className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs bg-accent text-white hover:bg-accent/90 rounded-xl font-bold transition min-h-[48px]"
            >
              <span>Avançar</span>
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChecklistPreenchimento;