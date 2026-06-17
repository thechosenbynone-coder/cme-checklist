import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, FileText, CheckCircle2, User, AlertTriangle } from 'lucide-react';
import { Card, Badge, Button } from '@cme/ui';
import api from '../services/api';
import { Inspecao } from '@cme/types';
import { generateInspectionPDF } from '../utils/pdfGenerator';
import { exportSingleInspectionToExcel } from '../utils/excelExporter';

export const InspecaoDetalhes: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspecao, setInspecao] = useState<Inspecao | null>(null);
  const [userRole, setUserRole] = useState<string>('Operador');
  const [validando, setValidando] = useState(false);

  useEffect(() => {
    if (id) {
      api.inspecoes.get(id).then(data => {
        if (data) setInspecao(data);
      });
    }
    const user = api.auth.currentUser();
    if (user && user.funcao) {
      setUserRole(user.funcao);
    }
  }, [id]);

  if (!inspecao) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <span className="text-3xl">⚠️</span>
        <p className="text-slate-500 font-bold uppercase tracking-wider mt-4">Inspeção não encontrada</p>
        <Button onClick={() => navigate('/')} className="mt-6 bg-blue-600 text-white hover:bg-blue-700">Voltar ao Painel</Button>
      </div>
    );
  }

  // Agrupar itens por seção para exibição estruturada
  const secoes: Record<string, typeof inspecao.respostas> = {};
  inspecao.respostas.forEach(resp => {
    const secName = resp.item?.secao || 'GERAL';
    if (!secoes[secName]) secoes[secName] = [];
    secoes[secName].push(resp);
  });

  const handleValidate = async () => {
    if (!inspecao) return;
    setValidando(true);
    try {
      const updated = await api.inspecoes.validar(inspecao.id);
      setInspecao(updated);
      alert('Inspeção validada! O equipamento foi liberado. ✅');
    } catch (e: any) {
      alert(e?.message || 'Erro ao validar a inspeção.');
    } finally {
      setValidando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Button & Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-slate-500 hover:text-slate-800 transition-colors text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar ao Painel</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => generateInspectionPDF(inspecao)}
            className="flex items-center gap-2 bg-white text-gray-800 border border-gray-200 hover:bg-gray-50"
          >
            <FileText className="h-4 w-4 text-red-600" />
            <span>Baixar PDF</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => exportSingleInspectionToExcel(inspecao)}
            className="flex items-center gap-2 bg-white text-gray-800 border border-gray-200 hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Exportar Excel</span>
          </Button>

          {inspecao.status !== 'VALIDADA' && ['GESTOR', 'ADMIN'].includes((userRole || '').toUpperCase()) && (
            <Button
              variant="success"
              onClick={handleValidate}
              disabled={validando}
              className="flex items-center gap-2 bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{validando ? 'Validando...' : 'Validar e Liberar'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Overview Card */}
      <Card 
        title={`Inspeção: ${inspecao.equipamento?.codigo} - ${inspecao.equipamento?.nome}`}
        subtitle={`Documento: ${inspecao.numeroDocumento || inspecao.id}${inspecao.modeloVersao ? ` · Modelo v${inspecao.modeloVersao}` : ''}${inspecao.validadaEm ? ` · Validada em ${new Date(inspecao.validadaEm).toLocaleString('pt-BR')}` : ''}`}
        headerAction={<Badge type={inspecao.status} />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          <div>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide block">Tipo de Inspeção</span>
            <span className="text-slate-900 text-sm font-bold block mt-1">
              {inspecao.tipo.replace('_', ' ')}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide block">Data e Hora</span>
            <span className="text-slate-900 text-sm font-bold block mt-1">
              {new Date(inspecao.data).toLocaleString('pt-BR')}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide block">Responsável Geral</span>
            <span className="text-slate-900 text-sm font-bold block mt-1">
              {inspecao.responsavelGeral || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide block">Localização / Base</span>
            <span className="text-slate-900 text-sm font-bold block mt-1">
              {inspecao.localizacao || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide block">Origem</span>
            <span className="text-slate-900 text-sm font-bold block mt-1">
              {inspecao.origem || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide block">Destino</span>
            <span className="text-slate-900 text-sm font-bold block mt-1">
              {inspecao.destino || 'N/A'}
            </span>
          </div>
        </div>
      </Card>

      {/* Main Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Checklist Items Responses */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Respostas do Checklist</h2>
          {Object.entries(secoes).map(([secName, respostas]) => (
            <Card key={secName} title={secName}>
              <div className="divide-y divide-slate-100 -mt-6 -mb-6">
                {respostas.map(resp => (
                  <div key={resp.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <p className="text-slate-800 font-medium">
                        {resp.item?.descricao}
                      </p>

                      {/* Certificados info if present */}
                      {(resp.certificadoId || resp.certificadoValidade) && (
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-555 font-medium bg-slate-50 border border-slate-100 p-2 rounded-lg max-w-fit">
                          {resp.certificadoId && (
                            <span><strong className="text-slate-700">Certificado ID:</strong> {resp.certificadoId}</span>
                          )}
                          {resp.certificadoValidade && (
                            <span><strong className="text-slate-700">Validade:</strong> {resp.certificadoValidade}</span>
                          )}
                        </div>
                      )}

                      {/* Medição (valor numérico + unidade) */}
                      {resp.item?.tipo === 'MEDICAO' && (
                        <div className="mt-1.5 text-xs bg-sky-50 border border-sky-100 text-sky-800 px-2.5 py-1 rounded-lg max-w-fit font-semibold">
                          Leitura: <strong>{resp.valorNumerico ?? '—'}</strong> {resp.item?.unidade || ''}
                        </div>
                      )}

                      {/* Texto (observação livre) */}
                      {resp.item?.tipo === 'TEXTO' && resp.valorTexto && (
                        <p className="mt-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-100 p-2 rounded-lg whitespace-pre-wrap">
                          {resp.valorTexto}
                        </p>
                      )}

                      {/* Evidência Fotográfica da Plaqueta */}
                      {(resp.fotoUrl || resp.fotoBase64) && (
                        <div className="mt-2.5">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Evidência Fotográfica</span>
                          <img
                            src={api.mediaUrl(resp.fotoUrl || resp.fotoBase64)}
                            alt="Foto da Plaqueta"
                            className="h-16 w-28 object-cover rounded-lg border border-slate-200 shadow-sm cursor-zoom-in hover:opacity-90 transition"
                            onClick={() => {
                              const newTab = window.open();
                              if (newTab) {
                                newTab.document.write(`<img src="${api.mediaUrl(resp.fotoUrl || resp.fotoBase64)}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                              }
                            }}
                          />
                        </div>
                      )}


                      {(resp.observacao || (resp.responsavel && resp.responsavel.trim())) && (
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {resp.observacao && (
                            <span className="text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                              Obs: {resp.observacao}
                            </span>
                          )}
                          {resp.responsavel && resp.responsavel.trim() && (
                            <span className="text-xs text-blue-700 bg-blue-50/50 border border-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <User className="h-3 w-3 text-blue-500" />
                              Executante: {resp.responsavel}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Evidência de Resolução */}
                      {resp.status === 'PENDENTE' && resp.pendenciaResolvida && (resp.fotoResolvidaUrl || resp.fotoResolvidaBase64) && (
                        <div className="mt-2.5">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Evidência de Resolução (Reparo)</span>
                          {(resp.fotoResolvidaUrl || resp.fotoResolvidaBase64)?.includes('video-') || (resp.fotoResolvidaUrl || resp.fotoResolvidaBase64)?.endsWith('.webm') || (resp.fotoResolvidaUrl || resp.fotoResolvidaBase64)?.startsWith('data:video/') ? (
                            <video
                              src={api.mediaUrl(resp.fotoResolvidaUrl || resp.fotoResolvidaBase64)}
                              controls
                              className="h-24 w-40 object-cover rounded-lg border border-slate-300 shadow-sm"
                            />
                          ) : (
                            <img
                              src={api.mediaUrl(resp.fotoResolvidaUrl || resp.fotoResolvidaBase64)}
                              alt="Foto da Pendência Resolvida"
                              className="h-16 w-28 object-cover rounded-lg border border-slate-200 shadow-sm cursor-zoom-in hover:opacity-90 transition"
                              onClick={() => {
                                const newTab = window.open();
                                if (newTab) {
                                  newTab.document.write(`<img src="${api.mediaUrl(resp.fotoResolvidaUrl || resp.fotoResolvidaBase64)}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                                }
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {resp.status === 'PENDENTE' ? (
                        resp.pendenciaResolvida ? (
                          <Badge type="success" label="Resolvido em Campo" />
                        ) : (
                          <Badge type="danger" label="Pendente Ativo" />
                        )
                      ) : resp.item?.tipo === 'MEDICAO' ? (
                        <span className="text-xs font-extrabold bg-sky-50 border border-sky-150 text-sky-700 px-2.5 py-1 rounded-full">
                          {resp.valorNumerico ?? '—'} {resp.item?.unidade || ''}
                        </span>
                      ) : resp.item?.tipo === 'TEXTO' ? (
                        <span className="text-[10px] font-extrabold bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-full uppercase">
                          Observação
                        </span>
                      ) : resp.status ? (
                        <Badge type={resp.status} />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Right Column: Consumed Materials & Digital Signature */}
        <div className="space-y-6">
          
          {/* Fotos do Equipamento */}
          {((inspecao.fotosUrls && inspecao.fotosUrls.length > 0) || (inspecao.fotosEquipamento && inspecao.fotosEquipamento.length > 0)) && (
            <Card title="Fotos do Equipamento">
              <div className="grid grid-cols-3 gap-2">
                {(inspecao.fotosUrls || inspecao.fotosEquipamento || []).map((foto, idx) => {
                  const isVideo = foto.includes('video-') || foto.endsWith('.webm') || foto.startsWith('data:video/');
                  return (
                    <div key={idx} className="aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-50 relative group">
                      {isVideo ? (
                        <video
                          src={api.mediaUrl(foto)}
                          controls
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={api.mediaUrl(foto)}
                          alt={`Foto do Equipamento ${idx + 1}`}
                          className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition"
                          onClick={() => {
                            const newTab = window.open();
                            if (newTab) {
                              newTab.document.write(`<img src="${api.mediaUrl(foto)}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                            }
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Materials Consumed Card */}
          <Card title="Materiais Utilizados">
            {inspecao.materiais.length === 0 ? (
              <p className="text-slate-400 text-xs py-4 text-center">Nenhum material utilizado nesta inspeção.</p>
            ) : (
              <div className="space-y-3">
                {inspecao.materiais.map(mat => (
                  <div key={mat.id} className="bg-white border border-slate-100 rounded-lg p-3 flex justify-between items-start text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">{mat.material?.descricao}</span>
                      <span className="text-slate-400 text-[10px] block mt-0.5">SKU: {mat.material?.codigo}</span>
                      {mat.observacao && <span className="text-[10px] text-amber-600 block mt-0.5">Nota: {mat.observacao}</span>}
                    </div>
                    <span className="bg-slate-100 px-2.5 py-1 rounded font-bold text-slate-700 whitespace-nowrap">
                      {mat.quantidade} {mat.material?.unidade}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Observations Card */}
          <Card title="Observações Gerais">
            <p className="text-xs text-slate-650 leading-relaxed bg-slate-55 border border-slate-100 p-3 rounded-lg">
              {inspecao.observacoesGerais || 'Sem observações adicionais.'}
            </p>
          </Card>

          {/* Inspector Signature Box */}
          <Card title="Assinatura Digital Encerramento">
            {(inspecao.assinaturaUrl || inspecao.assinaturaBase64) ? (
              <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 flex items-center justify-center h-24">
                <img
                  src={api.mediaUrl(inspecao.assinaturaUrl || inspecao.assinaturaBase64)}
                  alt="Assinatura do Inspetor"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="border border-dashed border-slate-200 rounded-lg p-4 bg-slate-50 flex items-center justify-center h-24 text-xs text-slate-400">
                Assinatura não cadastrada.
              </div>
            )}
          </Card>
        </div>

      </div>
    </div>
  );
};

export default InspecaoDetalhes;