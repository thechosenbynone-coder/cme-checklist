import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, AlertTriangle, HelpCircle, Loader2, ShieldCheck, Package, Camera, FileSignature, User, MapPin, Calendar } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { AppHeader } from '../components/ui/AppHeader';
import { cn } from '../lib/cn';
import api from '../services/api';
import { Inspecao, RespostaItem, StatusItem } from '@cme/types';

const fmtDateTime = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getTipoLabel = (tipo?: string) => {
  switch (tipo) {
    case 'PRE_EMBARQUE': return 'Pré-Embarque';
    case 'OPERACIONAL': return 'Operacional';
    case 'RETORNO_EMBARQUE': return 'Retorno';
    default: return tipo || '';
  }
};

const STATUS_CFG: Record<StatusItem, { icon: React.ElementType; label: string; cls: string }> = {
  OK: { icon: Check, label: 'OK', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' },
  PENDENTE: { icon: AlertTriangle, label: 'Pendente', cls: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400' },
  NAO_APLICAVEL: { icon: HelpCircle, label: 'N/A', cls: 'bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-muted' },
};

const isVideo = (url: string) =>
  url.includes('video-') || url.endsWith('.webm') || url.startsWith('data:video/');

const Evidencia: React.FC<{ url: string; alt: string }> = ({ url, alt }) => {
  const src = api.mediaUrl(url);
  return isVideo(url) ? (
    <video src={src} controls className="h-28 w-44 object-cover rounded-lg border border-border shadow-sm" />
  ) : (
    <img src={src} alt={alt} className="h-28 w-44 object-cover rounded-lg border border-border shadow-sm" />
  );
};

export const ChecklistRevisao: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [inspecao, setInspecao] = useState<Inspecao | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.inspecoes.get(id);
        if (cancel) return;
        if (!data) {
          setError('Inspeção não encontrada.');
        } else {
          setInspecao(data);
        }
      } catch (err: any) {
        if (!cancel) setError(err.message || 'Erro ao carregar a inspeção.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [id, navigate]);

  // Agrupa respostas por seção, preservando a ordem dos itens.
  const respostas: RespostaItem[] = (inspecao?.respostas || [])
    .slice()
    .sort((a, b) => (a.item?.ordem || 0) - (b.item?.ordem || 0));

  const secoes: { secao: string; itens: RespostaItem[] }[] = [];
  respostas.forEach((r) => {
    const secao = r.item?.secao || 'OUTROS';
    let grupo = secoes.find((s) => s.secao === secao);
    if (!grupo) {
      grupo = { secao, itens: [] };
      secoes.push(grupo);
    }
    grupo.itens.push(r);
  });

  const isValidada = inspecao?.status === 'VALIDADA';

  return (
    <div className="min-h-[100dvh] bg-bg text-content flex flex-col">
      <AppHeader title="CONFERÊNCIA" subtitle="Checklist preenchido (somente leitura)">
        <button
          onClick={() => navigate('/')}
          className="p-2 text-white/80 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition min-h-[48px] min-w-[48px] flex items-center justify-center"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </AppHeader>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5">
        <div className="max-w-md mx-auto space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-xs text-muted font-semibold uppercase tracking-wider">Carregando inspeção...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-xs p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          ) : inspecao ? (
            <>
              {/* Cabeçalho da inspeção */}
              <Card>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold text-muted uppercase tracking-widest">Equipamento</p>
                      <h2 className="text-sm font-extrabold text-content truncate">
                        {inspecao.equipamento?.codigoExibicao || inspecao.equipamento?.codigo || '—'}
                      </h2>
                      <p className="text-[11px] text-muted truncate">{inspecao.equipamento?.nome}</p>
                    </div>
                    <span className={cn(
                      'shrink-0 text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-full tracking-wider border',
                      isValidada
                        ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                    )}>
                      {isValidada ? 'Validado' : 'Concluído'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-content font-semibold">{getTipoLabel(inspecao.tipo)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-content font-semibold truncate">{fmtDateTime(inspecao.data)}</span>
                    </div>
                    {inspecao.responsavelGeral && (
                      <div className="flex items-center gap-1.5 text-muted col-span-2">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-content font-semibold truncate">{inspecao.responsavelGeral}</span>
                      </div>
                    )}
                    {(inspecao.origem || inspecao.destino) && (
                      <div className="flex items-center gap-1.5 text-muted col-span-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-content font-semibold truncate">
                          {inspecao.origem || '—'} ➔ {inspecao.destino || '—'}
                        </span>
                      </div>
                    )}
                    {inspecao.compressorUtilizado && (
                      <div className="col-span-2 text-muted">
                        <span className="font-bold uppercase text-[9px] tracking-wider">Compressores: </span>
                        <span className="text-content font-semibold">{inspecao.compressorUtilizado}</span>
                      </div>
                    )}
                    {inspecao.classificacao && (
                      <div className="col-span-2 text-muted">
                        <span className="font-bold uppercase text-[9px] tracking-wider">Classificação: </span>
                        <span className="text-content font-semibold">{String(inspecao.classificacao).replace('_', ' ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Seções e itens respondidos */}
              {secoes.length === 0 ? (
                <div className="bg-surface/50 border border-dashed border-border rounded-2xl py-8 text-center text-xs text-muted font-medium">
                  Esta inspeção não possui itens registrados.
                </div>
              ) : (
                secoes.map((grupo) => (
                  <div key={grupo.secao} className="space-y-2.5">
                    <h3 className="text-[10px] font-extrabold text-primary uppercase tracking-wider px-1 pt-1">
                      {grupo.secao}
                    </h3>
                    {grupo.itens.map((r) => {
                      const item = r.item;
                      const tipo = item?.tipo || 'STATUS';
                      const statusCfg = r.status ? STATUS_CFG[r.status] : null;
                      const StatusIcon = statusCfg?.icon;
                      return (
                        <Card key={r.id}>
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-bold text-content leading-snug flex-1">
                                <span className="text-muted font-extrabold">{item?.ordem}. </span>
                                {item?.descricao}
                              </p>
                              {statusCfg && StatusIcon && (
                                <span className={cn(
                                  'shrink-0 flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-1 rounded-full border tracking-wider',
                                  statusCfg.cls
                                )}>
                                  <StatusIcon className="h-3 w-3" />
                                  {statusCfg.label}
                                </span>
                              )}
                            </div>

                            {/* MEDICAO */}
                            {tipo === 'MEDICAO' && (
                              <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-lg px-3 py-2 text-sm font-bold text-sky-700 dark:text-sky-300">
                                {r.valorNumerico !== undefined && r.valorNumerico !== null
                                  ? `${r.valorNumerico} ${item?.unidade || ''}`
                                  : <span className="text-muted font-medium italic">Sem leitura</span>}
                              </div>
                            )}

                            {/* TEXTO */}
                            {tipo === 'TEXTO' && (
                              <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-content whitespace-pre-wrap">
                                {r.valorTexto || <span className="text-muted italic">Sem texto</span>}
                              </div>
                            )}

                            {/* CERTIFICADO */}
                            {tipo === 'CERTIFICADO' && (r.certificadoId || r.certificadoValidade) && (
                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
                                  <span className="block text-[8px] font-bold text-muted uppercase">ID Certificado</span>
                                  <span className="text-content font-semibold">{r.certificadoId || '—'}</span>
                                </div>
                                <div className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
                                  <span className="block text-[8px] font-bold text-muted uppercase">Validade</span>
                                  <span className="text-content font-semibold">{r.certificadoValidade || '—'}</span>
                                </div>
                              </div>
                            )}

                            {/* Observação */}
                            {r.observacao && (
                              <p className="text-[11px] text-muted bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
                                <span className="font-bold uppercase text-[8px] tracking-wider">Obs: </span>
                                {r.observacao}
                              </p>
                            )}

                            {/* Responsável */}
                            {r.responsavel && (
                              <p className="text-[10px] text-muted">
                                <span className="font-bold uppercase tracking-wider">Executante: </span>
                                <span className="text-content font-semibold">{r.responsavel}</span>
                              </p>
                            )}

                            {/* Pendência resolvida + evidência */}
                            {r.pendenciaResolvida !== undefined && (
                              <div className="pt-1.5 border-t border-border space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider">
                                  Pendência:{' '}
                                  <span className={r.pendenciaResolvida ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                                    {r.pendenciaResolvida ? 'Resolvida' : 'Não resolvida'}
                                  </span>
                                </p>
                                {r.fotoResolvidaUrl && <Evidencia url={r.fotoResolvidaUrl} alt="Evidência da pendência" />}
                              </div>
                            )}

                            {/* Foto do item */}
                            {r.fotoUrl && <Evidencia url={r.fotoUrl} alt="Foto do item" />}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ))
              )}

              {/* Materiais utilizados */}
              {inspecao.materiais && inspecao.materiais.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[10px] font-extrabold text-primary uppercase tracking-wider px-1 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" /> Materiais Utilizados
                  </h3>
                  <Card>
                    <div className="space-y-2">
                      {inspecao.materiais.map((mat) => (
                        <div key={mat.id} className="flex justify-between items-center text-xs border-b border-border last:border-0 pb-2 last:pb-0">
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-content block truncate">{mat.material?.descricao || mat.materialId}</span>
                            {mat.observacao && <span className="text-[10px] text-amber-600 dark:text-amber-400 block truncate">{mat.observacao}</span>}
                          </div>
                          <span className="shrink-0 text-content font-semibold">{mat.quantidade} {mat.material?.unidade || ''}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {/* Fotos do equipamento */}
              {inspecao.fotosUrls && inspecao.fotosUrls.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[10px] font-extrabold text-primary uppercase tracking-wider px-1 flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5" /> Fotos do Equipamento
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {inspecao.fotosUrls.map((url, i) => (
                      isVideo(url) ? (
                        <video key={i} src={api.mediaUrl(url)} controls className="aspect-square object-cover rounded-lg border border-border" />
                      ) : (
                        <img key={i} src={api.mediaUrl(url)} alt={`Evidência ${i + 1}`} className="aspect-square object-cover rounded-lg border border-border" />
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* Observações gerais */}
              {inspecao.observacoesGerais && (
                <div className="space-y-2.5">
                  <h3 className="text-[10px] font-extrabold text-primary uppercase tracking-wider px-1">Observações Gerais</h3>
                  <Card>
                    <p className="text-xs text-content whitespace-pre-wrap">{inspecao.observacoesGerais}</p>
                  </Card>
                </div>
              )}

              {/* Assinatura */}
              {inspecao.assinaturaUrl && (
                <div className="space-y-2.5">
                  <h3 className="text-[10px] font-extrabold text-primary uppercase tracking-wider px-1 flex items-center gap-1.5">
                    <FileSignature className="h-3.5 w-3.5" /> Assinatura
                  </h3>
                  <Card>
                    <img src={api.mediaUrl(inspecao.assinaturaUrl)} alt="Assinatura" className="w-full max-h-40 object-contain bg-white rounded-lg" />
                  </Card>
                </div>
              )}

              <div className="h-4" />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ChecklistRevisao;
