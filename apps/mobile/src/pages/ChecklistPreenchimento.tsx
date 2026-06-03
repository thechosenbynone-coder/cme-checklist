import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, AlertTriangle, HelpCircle, Save, Plus, Trash, ShieldCheck, ChevronRight, ChevronLeft } from 'lucide-react';
import { Card, Button } from '@cme/ui';
import api from '../services/api';
import { Equipamento, ChecklistModelo, Material, Inspecao, RespostaItem, MaterialUtilizado, StatusItem } from '@cme/types';

export const ChecklistPreenchimento: React.FC = () => {
  const navigate = useNavigate();
  const [metadata, setMetadata] = useState<any>(null);
  const [equipamento, setEquipamento] = useState<Equipamento | null>(null);
  const [modelo, setModelo] = useState<ChecklistModelo | null>(null);
  
  // Respostas e Materiais catalog
  const [respostas, setRespostas] = useState<Record<string, { status: StatusItem; observacao: string; responsavel: string }>>({});
  const [materiaisDisponiveis, setMateriaisDisponiveis] = useState<Material[]>([]);
  const [materiaisUtilizados, setMateriaisUtilizados] = useState<Omit<MaterialUtilizado, 'id' | 'inspecaoId'>[]>([]);
  
  // Wizard Navigation State
  const [currentStep, setCurrentStep] = useState(0);
  
  // Adição de materiais local state
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialQty, setMaterialQty] = useState(1);
  const [materialObs, setMaterialObs] = useState('');
  
  // Observações gerais da inspeção
  const [observacoesGerais, setObservacoesGears] = useState('');

  // Canvas Signature ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    // 1. Carregar metadados da sessão
    const metaRaw = window.sessionStorage.getItem('cme_nova_inspecao_meta');
    if (!metaRaw) {
      navigate('/');
      return;
    }
    const meta = JSON.parse(metaRaw);
    setMetadata(meta);

    // 2. Carregar Equipamento
    api.equipamentos.list().then(eqs => {
      const eq = eqs.find(e => e.id === meta.equipamentoId);
      if (eq) {
        setEquipamento(eq);
        // 3. Carregar Modelo correspondente
        api.modelos.getPorTipo(eq.tipo).then(mod => {
          if (mod) {
            setModelo(mod);
            // Inicializar respostas em branco
            const initialRespostas: typeof respostas = {};
            mod.itens?.forEach(item => {
              initialRespostas[item.id] = {
                status: 'OK',
                observacao: '',
                responsavel: ''
              };
            });
            setRespostas(initialRespostas);
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

  // Resposta status changer
  const handleStatusChange = (itemId: string, status: StatusItem) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], status }
    }));
    
    // Auto-advance after status selection (optional, but requested/user-friendly)
    // We delay slightly so the user sees the button tick/select before moving
    setTimeout(() => {
      goToNextStep();
    }, 250);
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

    // Obter assinatura em Base64
    let assinaturaBase64 = '';
    const canvas = canvasRef.current;
    if (canvas) {
      const blank = document.createElement('canvas');
      blank.width = canvas.width;
      blank.height = canvas.height;
      if (canvas.toDataURL() !== blank.toDataURL()) {
        assinaturaBase64 = canvas.toDataURL();
      }
    }

    const inspecaoId = `insp-${Date.now()}`;

    // Mapear respostas estruturadas para o tipo
    const finalRespostas: RespostaItem[] = Object.entries(respostas).map(([itemId, value]) => ({
      id: `resp-${itemId}-${Date.now()}`,
      inspecaoId,
      itemId,
      status: value.status,
      observacao: value.observacao || undefined,
      responsavel: value.responsavel || undefined,
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
      responsavelGeral: metadata.responsavelGeral,
      localizacao: metadata.localizacao,
      status: 'CONCLUIDA',
      observacoesGerais: observacoesGerais || undefined,
      assinaturaBase64: assinaturaBase64 || undefined,
      respostas: finalRespostas,
      materiais: finalMateriais,
    };

    await api.inspecoes.save(novaInspecao);
    
    window.sessionStorage.removeItem('cme_nova_inspecao_meta');
    alert('Inspeção de After Cooler concluída com sucesso e enviada ao servidor local! ✅');
    navigate('/');
  };

  const handleBackToSelect = () => {
    if (window.confirm('Deseja realmente voltar? As respostas preenchidas serão perdidas.')) {
      window.sessionStorage.removeItem('cme_nova_inspecao_meta');
      navigate('/');
    }
  };

  // Helper selectors for steps navigation
  const totalItens = modelo?.itens?.length || 0;
  // Total Wizard steps: Checklist items (27) + Materials (1) + General Obs (1) + Signature (1) = 30 steps total
  const totalSteps = totalItens + 3;

  const goToNextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const progressPercentage = Math.round(((currentStep + 1) / totalSteps) * 100);

  // Active step rendering logic
  const renderStepContent = () => {
    if (!modelo) return null;

    // Steps 0 to totalItens - 1 are individual checklist items
    if (currentStep < totalItens) {
      const item = modelo.itens?.[currentStep];
      if (!item) return null;
      const resp = respostas[item.id] || { status: 'OK', observacao: '', responsavel: '' };

      return (
        <div className="space-y-6 animate-fadeIn">
          {/* Section Indicator */}
          <div className="bg-blue-50 border border-blue-100 text-blue-750 px-3.5 py-2.5 rounded-2xl text-[11px] font-bold uppercase tracking-wide">
            Seção: {item.secao}
          </div>

          {/* Item description */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Item {item.ordem}</span>
            <p className="text-sm font-bold text-slate-800 leading-relaxed">
              {item.descricao}
            </p>
          </div>

          {/* Status Selection Big Touch Targets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleStatusChange(item.id, 'OK')}
              className={`py-4 px-4 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 border transition-all active:scale-95 ${
                resp.status === 'OK'
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/10'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Check className="h-5 w-5" />
              <span>Conforme</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusChange(item.id, 'PENDENTE')}
              className={`py-4 px-4 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 border transition-all active:scale-95 ${
                resp.status === 'PENDENTE'
                  ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-md shadow-amber-500/10'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
              <span>Pendente</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusChange(item.id, 'NAO_APLICAVEL')}
              className={`py-4 px-4 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 border transition-all active:scale-95 ${
                resp.status === 'NAO_APLICAVEL'
                  ? 'bg-slate-650 border-slate-650 text-white shadow-md shadow-slate-600/10'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <HelpCircle className="h-5 w-5" />
              <span>Não Aplicável</span>
            </button>
          </div>

          {/* Optional metadata (Executante & observações) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 shadow-sm">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Informações Adicionais (Opcional)</span>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Responsável pela execução (Executante)</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  value={resp.responsavel}
                  onChange={(e) => handleRespChange(item.id, e.target.value)}
                >
                  <option value="">Selecione executante...</option>
                  <option value="Mecânica">Mecânica</option>
                  <option value="Elétrica">Elétrica</option>
                  <option value="Instrumentação">Instrumentação</option>
                  <option value="Pintura / Estrutura">Pintura / Estrutura</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Nota / Observação do Item</label>
                <input
                  type="text"
                  placeholder="Ex: Vazamento identificado na gaxeta..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  value={resp.observacao}
                  onChange={(e) => handleObsChange(item.id, e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Step `totalItens` is Materials consumed
    if (currentStep === totalItens) {
      return (
        <div className="space-y-5 animate-fadeIn">
          <Card title="Materiais Consumidos no Teste" subtitle="Selecione e registre materiais utilizados durante a manutenção">
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Material</label>
                  <select
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 outline-none"
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
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Qtd</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-center outline-none"
                      value={materialQty}
                      onChange={(e) => setMaterialQty(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Observações SKU</label>
                    <input
                      type="text"
                      placeholder="Troca preventiva..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                      value={materialObs}
                      onChange={(e) => setMaterialObs(e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddMaterial}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4" />
                  <span>Adicionar Material</span>
                </Button>
              </div>

              {/* List of currently added materials */}
              {materiaisUtilizados.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Materiais Adicionados:</span>
                  {materiaisUtilizados.map(mat => (
                    <div key={mat.materialId} className="flex justify-between items-center bg-slate-50 border border-slate-150 p-2.5 rounded-xl text-xs">
                      <div className="flex-1 pr-2">
                        <span className="font-bold text-slate-700 block leading-tight">{mat.material?.descricao}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">SKU: {mat.material?.codigo} &bull; Qtd: {mat.quantidade} {mat.material?.unidade}</span>
                        {mat.observacao && <span className="text-[10px] text-amber-600 block mt-0.5">Nota: {mat.observacao}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(mat.materialId)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      );
    }

    // Step `totalItens + 1` is General Observations
    if (currentStep === totalItens + 1) {
      return (
        <div className="space-y-5 animate-fadeIn">
          <Card title="Observações Gerais da Inspeção" subtitle="Comentários adicionais referentes ao teste ou condições do After Cooler">
            <textarea
              rows={5}
              placeholder="Descreva observações gerais referentes ao teste dinâmico de troca de temperatura ou outros eventos operacionais..."
              className="w-full p-3 border border-slate-200 rounded-lg text-xs bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              value={observacoesGerais}
              onChange={(e) => setObservacoesGears(e.target.value)}
            />
          </Card>
        </div>
      );
    }

    // Step `totalItens + 2` is Inspector Signature
    if (currentStep === totalItens + 2) {
      return (
        <div className="space-y-6 animate-fadeIn">
          <Card title="Assinatura do Inspetor" subtitle="Assine abaixo para encerrar e certificar o checklist">
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-inner relative">
                <canvas
                  ref={canvasRef}
                  width={350}
                  height={140}
                  className="w-full h-32 touch-none block bg-slate-50/50"
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
                <span className="text-slate-400 italic">Assine com o dedo ou caneta touch</span>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="text-slate-600 font-bold hover:text-slate-800 py-1 px-3 border border-slate-200 rounded-lg bg-white active:scale-95 transition"
                >
                  Limpar Campo
                </button>
              </div>
            </div>
          </Card>

          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 text-xs text-blue-800 leading-normal">
            <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <p>
              Ao finalizar, esta inspeção será salva com o status **Concluída** e enviada ao Portal para auditoria e validação da supervisão.
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 flex flex-col justify-between min-h-screen pb-24">
      {/* Header and Step Progress bar */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
          <button onClick={handleBackToSelect} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-800 leading-tight">Preenchimento de Checklist</h1>
            <p className="text-[10px] text-slate-400 font-semibold uppercase">{equipamento?.codigo} &bull; {metadata?.tipo.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Progress metrics */}
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] font-bold text-slate-500">
            <span>Passo {currentStep + 1} de {totalSteps}</span>
            <span>{progressPercentage}% Concluído</span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-2 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Form Step Area */}
      <div className="flex-1 py-6">
        {renderStepContent()}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-150 p-4 shadow-lg z-50">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={goToPrevStep}
            disabled={currentStep === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs bg-white text-slate-700 border border-slate-250 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Voltar</span>
          </Button>

          {currentStep === totalSteps - 1 ? (
            <Button
              type="button"
              onClick={handleSaveChecklist}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs bg-blue-600 text-white hover:bg-blue-700 font-bold"
            >
              <Save className="h-4 w-4" />
              <span>Finalizar</span>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goToNextStep}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs bg-blue-600 text-white hover:bg-blue-700"
            >
              <span>Avançar</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChecklistPreenchimento;
