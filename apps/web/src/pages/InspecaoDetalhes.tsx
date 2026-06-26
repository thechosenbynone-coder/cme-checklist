import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, FileText, CheckCircle2, User, AlertTriangle, ShieldCheck, XCircle, X } from 'lucide-react';
import { Card, Badge, Button } from '@cme/ui';
import api, { ApiError } from '../services/api';
import { Inspecao, IntegridadeReport } from '@cme/types';
import { generateInspectionPDF } from '../utils/pdfGenerator';
import { exportSingleInspectionToExcel } from '../utils/excelExporter';

const SUCCESS_DISMISS_MS = 4000;

export const InspecaoDetalhes: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inspecao, setInspecao] = useState<Inspecao | null>(null);
  const [userRole, setUserRole] = useState<string>('Operador');
  const [validando, setValidando] = useState(false);
  const [integridade, setIntegridade] = useState<IntegridadeReport | null>(null);
  const [integridadeErro, setIntegridadeErro] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const carregarIntegridade = (inspId: string) => {
    setIntegridadeErro('');
    api.inspecoes
      .integridade(inspId)
      .then((rep) => setIntegridade(rep))
      .catch((e) => setIntegridadeErro(e?.message || 'Erro ao calcular integridade.'));
  };

  useEffect(() => {
    if (id) {
      api.inspecoes.get(id).then(data => {
        if (data) {
          setInspecao(data);
          if (data.status === 'CONCLUIDA') carregarIntegridade(data.id);
        }
      });
    }
    const user = api.auth.currentUser();
    if (user && user.funcao) {
      setUserRole(user.funcao);
    }
  }, [id]);

  // Auto-dismiss de sucesso; erros persistem até o usuário fechar.
  useEffect(() => {
    if (feedback?.type === 'success') {
      const t = setTimeout(() => setFeedback(null), SUCCESS_DISMISS_MS);
      return () => clearTimeout(t);
    }
  }, [feedback]);

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
    setFeedback(null);
    try {
      const updated = await api.inspecoes.validar(inspecao.id);
      setInspecao(updated);
      setIntegridade(null);
      setFeedback({ type: 'success', text: 'Inspeção validada — equipamento liberado.' });
    } catch (e: any) {
      // 422: integridade insuficiente. Atualiza o card com o relatório retornado.
      if (e instanceof ApiError && e.status === 422 && e.data?.integridade) {
        setIntegridade(e.data.integridade as IntegridadeReport);
        setFeedback({ type: 'error', text: 'Validação bloqueada: a inspeção não atende aos critérios de integridade. Veja as pendências abaixo.' });
      } else {
        setFeedback({ type: 'error', text: e?.message || 'Erro ao validar a inspeção.' });
      }
    } finally {
      setValidando(false);
    }
  };

  const aprovado = integridade?.aprovado === true;
  const podeValidar =
    inspecao?.status !== 'VALIDADA' && ['GESTOR', 'ADMIN'].includes((userRole || '').toUpperCase());

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

          {podeValidar && (
            <div className="flex flex-col items-stretch">
              <Button
                variant="success"
                onClick={handleValidate}
                disabled={validando || (inspecao.status === 'CONCLUIDA' && integridade != null && !aprovado)}
                className="flex items-center gap-2 bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{validando ? 'Validando...' : 'Validar e Liberar'}</span>
              </Button>
              {/* Texto estático (tooltip nativo não dispara em touch/tablet) */}
              {inspecao.status === 'CONCLUIDA' && integridade != null && !aprovado && (
                <span className="text-[10px] text-red-500 font-semibold mt-1 text-center max-w-[180px]">
                  Corrija as pendências abaixo para validar
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Banner de feedback (validação) */}
      {feedback && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-sm font-semibold ${
            feedback.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {feedback.text}
          </span>
          <button onClick={() => setFeedback(null)} className="opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Overview Card */}
      <Card 
        title={`Inspeção: ${inspecao.equipamento?.codigo} - ${inspecao.equipamento?.nome}`}
        subtitle={`Documento: ${inspecao.numeroDocumento || inspecao.id}${inspecao.modeloVersao ? ` · Modelo v${inspecao.modeloVersao}` : ''}${inspecao.validadaEm ? ` · Validada em ${new Date(inspecao.validadaEm).toLocaleString('pt-BR')}` : ''}`}
        headerAction={<Badge type={inspecao.status} />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-6">
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
          <div>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide block">Classificação</span>
            <span className="text-slate-900 text-sm font-bold block mt-1">
              {inspecao.classificacao ? inspecao.classificacao.replace('_', ' ') : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide block">Compressores</span>
            <span className="text-slate-900 text-sm font-bold block mt-1">
              {inspecao.compressorUtilizado || 'N/A'}
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

                      {/* Evidências do item (fotos legadas em fotosUrls + vídeo dedicado) */}
                      {((resp.fotosUrls && resp.fotosUrls.length > 0) || resp.videoUrl) && (
                        <div className="mt-2.5">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Evidências</span>
                          <div className="flex flex-wrap gap-2">
                            {(resp.fotosUrls || []).map((ev, i) => {
                              const isLegacyVideo = ev.includes('video-') || ev.endsWith('.webm') || ev.startsWith('data:video/');
                              return isLegacyVideo ? (
                                <video key={i} src={api.mediaUrl(ev)} controls className="h-20 w-32 object-cover rounded-lg border border-slate-200 shadow-sm" />
                              ) : (
                                <img
                                  key={i}
                                  src={api.mediaUrl(ev)}
                                  alt={`Evidência ${i + 1}`}
                                  className="h-20 w-32 object-cover rounded-lg border border-slate-200 shadow-sm cursor-zoom-in hover:opacity-90 transition"
                                  onClick={() => {
                                    const newTab = window.open();
                                    if (newTab) newTab.document.write(`<img src="${api.mediaUrl(ev)}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                                  }}
                                />
                              );
                            })}
                            {resp.videoUrl && (
                              <video src={api.mediaUrl(resp.videoUrl)} controls className="h-20 w-32 object-cover rounded-lg border border-slate-200 shadow-sm" />
                            )}
                          </div>
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

          {/* Integridade da Inspeção (somente quando concluída, aguardando validação) */}
          {inspecao.status === 'CONCLUIDA' && (
            <IntegridadeCard integridade={integridade} erro={integridadeErro} onRetry={() => carregarIntegridade(inspecao.id)} />
          )}

          {/* Fotos e Vídeo do Equipamento */}
          {((inspecao.fotosUrls && inspecao.fotosUrls.length > 0) || (inspecao.fotosEquipamento && inspecao.fotosEquipamento.length > 0) || inspecao.videoUrl) && (
            <Card title="Fotos e Vídeo do Equipamento">
              <div className="grid grid-cols-3 gap-2">
                {(inspecao.fotosUrls || inspecao.fotosEquipamento || []).map((foto, idx) => {
                  // Heurística mantida apenas como fallback para dados legados
                  // (vídeos antigos gravados dentro de fotosUrls). Uploads novos
                  // separam vídeo em inspecao.videoUrl.
                  const isLegacyVideo = foto.includes('video-') || foto.endsWith('.webm') || foto.startsWith('data:video/');
                  return (
                    <div key={idx} className="aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-50 relative group">
                      {isLegacyVideo ? (
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
              {inspecao.videoUrl && (
                <div className="mt-3">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Vídeo do Equipamento</span>
                  <video
                    src={api.mediaUrl(inspecao.videoUrl)}
                    controls
                    className="w-full rounded-lg border border-slate-200 shadow-sm"
                  />
                </div>
              )}
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

// Card de integridade: completude, pendências, evidências e gate de validação.
const IntegridadeCard: React.FC<{
  integridade: IntegridadeReport | null;
  erro: string;
  onRetry: () => void;
}> = ({ integridade, erro, onRetry }) => {
  if (erro) {
    return (
      <Card title="Integridade da Inspeção">
        <div className="text-center py-4 space-y-2">
          <p className="text-xs text-red-500 font-semibold">{erro}</p>
          <button onClick={onRetry} className="text-xs font-bold text-[#0b132b] underline">
            Tentar novamente
          </button>
        </div>
      </Card>
    );
  }
  if (!integridade) {
    return (
      <Card title="Integridade da Inspeção">
        <div className="animate-pulse space-y-2 py-2">
          <div className="h-3 bg-slate-100 rounded w-3/4" />
          <div className="h-2 bg-slate-100 rounded w-1/2" />
          <div className="h-2 bg-slate-100 rounded w-2/3" />
        </div>
      </Card>
    );
  }

  const { completude, aprovado, itensRespondidos, totalItens } = integridade;
  const barColor = completude >= 100 ? 'bg-green-500' : completude >= 80 ? 'bg-amber-500' : 'bg-red-500';

  const StatusLinha: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
    <div className="flex items-center gap-2 text-xs font-semibold">
      {ok ? <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
      <span className={ok ? 'text-slate-600' : 'text-red-600'}>{label}</span>
    </div>
  );

  return (
    <Card title="Integridade da Inspeção">
      <div className="space-y-3">
        {aprovado ? (
          <div className="flex items-center gap-2 text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <ShieldCheck className="h-4 w-4" /> Pronto para validar
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertTriangle className="h-4 w-4" /> Pendências bloqueiam a validação
          </div>
        )}

        {/* Barra de completude */}
        <div>
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Completude</span>
            <span>{itensRespondidos}/{totalItens} itens · {completude}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${completude}%` }} />
          </div>
        </div>

        {/* Status gerais */}
        <div className="space-y-1.5">
          <StatusLinha ok={integridade.temAssinatura} label={integridade.temAssinatura ? 'Assinatura registrada' : 'Assinatura ausente'} />
          <StatusLinha ok={integridade.temFotosOuVideoEquipamento} label={integridade.temFotosOuVideoEquipamento ? 'Fotos/vídeo do equipamento' : 'Sem foto/vídeo do equipamento'} />
        </div>

        {/* Itens obrigatórios pendentes */}
        {integridade.itensObrigatoriosPendentes.length > 0 && (
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-red-400 uppercase tracking-wider">
              Itens obrigatórios pendentes ({integridade.itensObrigatoriosPendentes.length})
            </span>
            <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {integridade.itensObrigatoriosPendentes.map((it) => (
                <li key={it.itemId} className="text-[11px] text-red-600 bg-red-50/60 border border-red-100 rounded-lg px-2 py-1">
                  <span className="font-bold">{it.secao}:</span> {it.descricao}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Evidências faltantes */}
        {integridade.evidenciasFaltantes.length > 0 && (
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider">
              Evidências faltantes ({integridade.evidenciasFaltantes.length})
            </span>
            <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
              {integridade.evidenciasFaltantes.map((ev) => (
                <li key={ev.itemId} className="text-[11px] text-amber-700 bg-amber-50/60 border border-amber-100 rounded-lg px-2 py-1">
                  {ev.descricao} — <span className="italic">{ev.motivo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Certificados vencidos */}
        {integridade.certificadosVencidos.length > 0 && (
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-red-400 uppercase tracking-wider">
              Certificados vencidos ({integridade.certificadosVencidos.length})
            </span>
            <ul className="space-y-1">
              {integridade.certificadosVencidos.map((c) => (
                <li key={c.itemId} className="text-[11px] text-red-600 bg-red-50/60 border border-red-100 rounded-lg px-2 py-1">
                  {c.descricao}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
};

export default InspecaoDetalhes;