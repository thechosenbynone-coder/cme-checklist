import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, AlertTriangle, HelpCircle, Save, Plus, Trash, ShieldCheck } from 'lucide-react';
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
  
  // Adição de materiais local state
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialQty, setMaterialQty] = useState(1);
  const [materialObs, setMaterialObs] = useState('');
  
  // Observações gerais da inspeção
  const [observacoesGerais, setObservacoesGerais] = useState('');

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
      // Verifica se o canvas foi desenhado (se não está completamente em branco)
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
      status: 'CONCLUIDA', // O inspetor de campo conclui
      observacoesGerais: observacoesGerais || undefined,
      assinaturaBase64: assinaturaBase64 || undefined,
      respostas: finalRespostas,
      materiais: finalMateriais,
    };

    await api.inspecoes.save(novaInspecao);
    
    // Clear session and navigate back
    window.sessionStorage.removeItem('cme_nova_inspecao_meta');
    alert('Inspeção de After Cooler concluída com sucesso e enviada ao servidor local! ✅');
    navigate('/');
  };

  // Agrupar itens do modelo por seção
  const itensAgrupados: Record<string, typeof modelo.itens> = {};
  modelo?.itens?.forEach(item => {
    if (!itensAgrupados[item.secao]) {
      itensAgrupados[item.secao] = [];
    }
    itensAgrupados[item.secao].push(item);
  });

  return (
    <div className="max-w-md mx-auto px-3 py-6 space-y-6 pb-20">
      {/* Top navbar */}
      <div className="flex items-center space-x-2 border-b pb-4">
        <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-800 leading-tight">Preenchimento de Checklist</h1>
          <p className="text-[10px] text-slate-400 font-semibold uppercase">{equipamento?.codigo} &bull; {metadata?.tipo.replace('_', ' ')}</p>
        </div>
      </div>

      {/* Accordions or Sections */}
      <div className="space-y-4">
        {Object.entries(itensAgrupados).map(([secaoNome, itens]) => (
          <Card key={secaoNome} title={secaoNome}>
            <div className="space-y-5 divide-y divide-slate-100">
              {itens?.map((item, idx) => {
                const resp = respostas[item.id] || { status: 'OK', observacao: '', responsavel: '' };
                return (
                  <div key={item.id} className={`${idx > 0 ? 'pt-4' : ''} space-y-3`}>
                    
                    {/* Item Description */}
                    <p className="text-xs font-semibold text-slate-700 leading-normal">
                      {item.ordem}. {item.descricao}
                    </p>

                    {/* Giant Tap Targets for Status */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(item.id, 'OK')}
                        className={`py-3.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all active:scale-95 ${
                          resp.status === 'OK'
                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                            : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        <Check className="h-4 w-4" />
                        <span>Conforme</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(item.id, 'PENDENTE')}
                        className={`py-3.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all active:scale-95 ${
                          resp.status === 'PENDENTE'
                            ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-md'
                            : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <span>Pendente</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(item.id, 'NAO_APLICAVEL')}
                        className={`py-3.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all active:scale-95 ${
                          resp.status === 'NAO_APLICAVEL'
                            ? 'bg-slate-500 border-slate-500 text-white shadow-md'
                            : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        <HelpCircle className="h-4 w-4" />
                        <span>N/A</span>
                      </button>
                    </div>

                    {/* Sub fields: comments and responsible executant */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Observações (opcional)"
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 w-full"
                        value={resp.observacao}
                        onChange={(e) => handleObsChange(item.id, e.target.value)}
                      />
                      <select
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 w-full text-slate-600"
                        value={resp.responsavel}
                        onChange={(e) => handleRespChange(item.id, e.target.value)}
                      >
                        <option value="">Executante...</option>
                        <option value="Mecânica">Mecânica</option>
                        <option value="Elétrica">Elétrica</option>
                        <option value="Instrumentação">Instrumentação</option>
                        <option value="Pintura / Estrutura">Pintura / Estrutura</option>
                      </select>
                    </div>

                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Materials Used Card */}
      <Card title="4. Materiais Consumidos no Teste">
        <div className="space-y-4">
          
          {/* Seletor de material catalog */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Material</label>
              <select
                className="w-full px-2.5 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-700"
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
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs text-center"
                  value={materialQty}
                  onChange={(e) => setMaterialQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Observações SKU</label>
                <input
                  type="text"
                  placeholder="Troca preventiva..."
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs"
                  value={materialObs}
                  onChange={(e) => setMaterialObs(e.target.value)}
                />
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleAddMaterial}
              className="w-full flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar Material</span>
            </Button>
          </div>

          {/* List of currently added materials */}
          {materiaisUtilizados.length > 0 && (
            <div className="mt-4 pt-3 border-t space-y-2">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Materiais Adicionados:</span>
              {materiaisUtilizados.map(mat => (
                <div key={mat.materialId} className="flex justify-between items-center bg-slate-50 border p-2.5 rounded-xl text-xs">
                  <div className="flex-1 pr-2">
                    <span className="font-bold text-slate-700 block leading-tight">{mat.material?.descricao}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">SKU: {mat.material?.codigo} &bull; Qtd: {mat.quantidade} {mat.material?.unidade}</span>
                    {mat.observacao && <span className="text-[10px] text-amber-600 block mt-0.5">Nota: {mat.observacao}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMaterial(mat.materialId)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </Card>

      {/* Observations and Comments */}
      <Card title="5. Observações Gerais da Inspeção">
        <textarea
          rows={3}
          placeholder="Descreva observações gerais referentes ao teste dinâmico de troca de temperatura ou outros eventos..."
          className="w-full p-3 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
          value={observacoesGerais}
          onChange={(e) => setObservacoesGerais(e.target.value)}
        />
      </Card>

      {/* Hand signature pad */}
      <Card title="6. Assinatura do Inspetor">
        <div className="space-y-3">
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-inner relative">
            <canvas
              ref={canvasRef}
              width={350}
              height={140}
              className="w-full h-32 touch-none block"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 italic">Assine com o dedo ou caneta touch</span>
            <button
              type="button"
              onClick={clearCanvas}
              className="text-slate-500 font-bold hover:text-slate-800 py-1 px-3 border border-slate-200 rounded-lg bg-white active:scale-95 transition-all"
            >
              Limpar Campo
            </button>
          </div>
        </div>
      </Card>

      {/* Action triggers */}
      <div className="pt-4">
        <Button
          onClick={handleSaveChecklist}
          fullWidth
          size="xl"
          className="flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/10"
        >
          <Save className="h-5 w-5" />
          <span>Finalizar e Salvar Inspeção</span>
        </Button>
      </div>

    </div>
  );
};
export default ChecklistPreenchimento;
