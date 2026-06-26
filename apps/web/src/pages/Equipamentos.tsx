import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileText,
  ClipboardPlus,
  X,
  Layers,
  CalendarClock,
  History,
} from 'lucide-react';
import api from '../services/api';
import { Equipamento, Certificado, Inspecao } from '@cme/types';
import { Link } from 'react-router-dom';

// Semáforo de liberação
const STATUS_META: Record<string, { label: string; cls: string; Icon: any }> = {
  LIBERADO: { label: 'Liberado', cls: 'bg-green-50 border-green-150 text-green-700', Icon: ShieldCheck },
  PENDENTE: { label: 'Pendente', cls: 'bg-amber-50 border-amber-200 text-amber-700', Icon: ShieldAlert },
  VENCIDO: { label: 'Vencido', cls: 'bg-red-50 border-red-150 text-red-700', Icon: ShieldX },
};

const fmtData = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const abrirMobile = (codigo?: string) => {
  const base =
    window.location.port === '5174'
      ? 'http://localhost:5173'
      : `${window.location.protocol}//${window.location.hostname}:5173`;
  window.open(codigo ? `${base}/?equip=${encodeURIComponent(codigo)}` : base, '_blank');
};

export const Equipamentos: React.FC = () => {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('ALL');
  const [localFiltro, setLocalFiltro] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Equipamento | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  // Busca inteligente com debounce no servidor.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.equipamentos
        .list(busca.trim() || undefined)
        .then((data) => setEquipamentos(data))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    if (!selecionadoId) {
      setDetalhe(null);
      return;
    }
    setLoadingDetalhe(true);
    api.equipamentos
      .get(selecionadoId)
      .then((d) => setDetalhe(d))
      .finally(() => setLoadingDetalhe(false));
  }, [selecionadoId]);

  const tipos = useMemo(
    () => ['ALL', ...Array.from(new Set(equipamentos.map((e) => e.tipo))).sort()],
    [equipamentos]
  );
  const locais = useMemo(
    () =>
      ['ALL', ...Array.from(new Set(equipamentos.map((e) => e.localizacaoAtual || '—'))).sort()],
    [equipamentos]
  );

  const filtrados = equipamentos.filter(
    (e) =>
      (tipoFiltro === 'ALL' || e.tipo === tipoFiltro) &&
      (localFiltro === 'ALL' || (e.localizacaoAtual || '—') === localFiltro)
  );

  const contagem = (s: string) => equipamentos.filter((e) => (e.statusLiberacao || 'PENDENTE') === s).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Equipamentos{' '}
            <span className="inline-flex items-center justify-center h-6 px-2.5 rounded-full bg-[#38bdf8] text-[#0b132b] text-[10px] font-extrabold uppercase align-middle ml-1 tracking-wider shadow-sm">
              CME
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 mt-1 font-semibold uppercase tracking-wide">
            Cockpit de liberação · certificados · histórico
          </p>
        </div>
        {/* Resumo semáforo */}
        <div className="flex items-center gap-2">
          {(['LIBERADO', 'PENDENTE', 'VENCIDO'] as const).map((s) => {
            const m = STATUS_META[s];
            return (
              <div key={s} className={`px-3 py-2 rounded-2xl border text-xs font-extrabold flex items-center gap-2 ${m.cls}`}>
                <m.Icon className="h-4 w-4" />
                <span>{contagem(s)}</span>
                <span className="font-bold opacity-70">{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Busca + filtros */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-4 shadow-sm space-y-3">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </span>
          <input
            type="text"
            placeholder="Busca inteligente: CME-AFTE.001, afte 001, compressor, BASE..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-slate-350 transition"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none"
            >
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t === 'ALL' ? 'Todos os tipos' : t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={localFiltro}
              onChange={(e) => setLocalFiltro(e.target.value)}
              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none"
            >
              {locais.map((l) => (
                <option key={l} value={l}>
                  {l === 'ALL' ? 'Todos os locais' : l}
                </option>
              ))}
            </select>
          </div>
          <span className="text-[11px] text-slate-400 font-semibold ml-auto">
            {loading ? 'Carregando...' : `${filtrados.length} equipamento(s)`}
          </span>
        </div>
      </div>

      {/* Grid de cards */}
      {!loading && filtrados.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200/80 rounded-3xl">
          <span className="text-2xl block">🔧</span>
          <p className="text-slate-400 text-xs mt-3 font-extrabold uppercase tracking-wider">
            Nenhum equipamento encontrado
          </p>
          <p className="text-slate-500 text-[10px] mt-1">
            Importe a planilha (npm run -w server importar) ou ajuste a busca/filtros.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((eq) => {
            const m = STATUS_META[eq.statusLiberacao || 'PENDENTE'] || STATUS_META.PENDENTE;
            const counts = (eq as any)._count || {};
            return (
              <button
                key={eq.id}
                onClick={() => setSelecionadoId(eq.id)}
                className="text-left bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-extrabold text-slate-900 block truncate">{eq.codigoExibicao || eq.codigo}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">
                      {eq.tipo}
                    </span>
                  </div>
                  <span className={`shrink-0 text-[9px] font-extrabold px-2.5 py-1 rounded-full border uppercase tracking-wider flex items-center gap-1 ${m.cls}`}>
                    <m.Icon className="h-3 w-3" />
                    {m.label}
                  </span>
                </div>
                <div className="mt-4 space-y-1.5 text-[11px] text-slate-500 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span>{eq.localizacaoAtual || '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Validade: {fmtData(eq.validadeCertificado)}</span>
                  </div>
                  <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{counts.certificados ?? 0} cert.</span>
                    <span className="flex items-center gap-1"><History className="h-3 w-3" />{counts.inspecoes ?? 0} insp.</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Drawer de detalhe */}
      {selecionadoId && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelecionadoId(null)}>
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#f3f5f4] h-full overflow-y-auto shadow-2xl border-l border-slate-200 animate-slideInRight"
            onClick={(e) => e.stopPropagation()}
          >
            <DetalheEquipamento
              detalhe={detalhe}
              loading={loadingDetalhe}
              onClose={() => setSelecionadoId(null)}
              onGerarChecklist={() => abrirMobile(detalhe?.codigoExibicao || detalhe?.codigo)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const DetalheEquipamento: React.FC<{
  detalhe: Equipamento | null;
  loading: boolean;
  onClose: () => void;
  onGerarChecklist: () => void;
}> = ({ detalhe, loading, onClose, onGerarChecklist }) => {
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'photo' | 'signature' | 'video'; source: string } | null>(null);

  if (loading || !detalhe) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">{loading ? 'Carregando...' : 'Selecione um equipamento.'}</div>
    );
  }
  const m = STATUS_META[detalhe.statusLiberacao || 'PENDENTE'] || STATUS_META.PENDENTE;
  const certs: Certificado[] = detalhe.certificados || [];
  const inspecoes: Inspecao[] = (detalhe as any).inspecoes || [];
  const dados = (detalhe.dadosPlanilha || {}) as Record<string, unknown>;

  const mediaList = useMemo(() => {
    const urls: { url: string; type: 'photo' | 'signature' | 'video'; source: string }[] = [];
    // Detecção legada de vídeo (dados antigos gravados dentro de fotosUrls).
    const isLegacyVideo = (u: string) =>
      u.includes('video-') || u.toLowerCase().endsWith('.webm') || u.startsWith('data:video/');

    inspecoes.forEach((insp) => {
      // Signature
      if (insp.assinaturaUrl) {
        urls.push({
          url: insp.assinaturaUrl,
          type: 'signature',
          source: `Assinatura de ${insp.responsavelGeral || 'Inspetor'} em ${new Date(insp.data).toLocaleDateString('pt-BR')}`
        });
      }
      // General inspection photos
      if (insp.fotosUrls && insp.fotosUrls.length > 0) {
        insp.fotosUrls.forEach((url, idx) => {
          urls.push({
            url,
            type: isLegacyVideo(url) ? 'video' : 'photo',
            source: `Foto Geral #${idx + 1} - ${insp.numeroDocumento || 'Sem Doc'}`
          });
        });
      }
      // General inspection video (campo dedicado)
      if (insp.videoUrl) {
        urls.push({
          url: insp.videoUrl,
          type: 'video',
          source: `Vídeo do Equipamento - ${insp.numeroDocumento || 'Sem Doc'}`,
        });
      }
      // Item response photos & video
      if (insp.respostas && insp.respostas.length > 0) {
        insp.respostas.forEach((resp) => {
          if (resp.fotoUrl) {
            urls.push({
              url: resp.fotoUrl,
              type: 'photo',
              source: `Evidência de Falha: ${resp.item?.descricao || 'Item'} - ${insp.numeroDocumento || 'Sem Doc'}`
            });
          }
          (resp.fotosUrls || []).forEach((url, i) => {
            urls.push({
              url,
              type: isLegacyVideo(url) ? 'video' : 'photo',
              source: `Evidência #${i + 1}: ${resp.item?.descricao || 'Item'} - ${insp.numeroDocumento || 'Sem Doc'}`,
            });
          });
          if (resp.videoUrl) {
            urls.push({
              url: resp.videoUrl,
              type: 'video',
              source: `Vídeo: ${resp.item?.descricao || 'Item'} - ${insp.numeroDocumento || 'Sem Doc'}`,
            });
          }
          if (resp.fotoResolvidaUrl) {
            urls.push({
              url: resp.fotoResolvidaUrl,
              type: isLegacyVideo(resp.fotoResolvidaUrl) ? 'video' : 'photo',
              source: `Evidência de Resolução: ${resp.item?.descricao || 'Item'} - ${insp.numeroDocumento || 'Sem Doc'}`
            });
          }
        });
      }
    });

    return urls;
  }, [inspecoes]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{detalhe.tipo}</span>
          <h2 className="text-xl font-extrabold text-slate-900 leading-tight">{detalhe.codigoExibicao || detalhe.codigo}</h2>
          <span className="text-[11px] text-slate-400">Canônico: {detalhe.codigo}</span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-500">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs font-extrabold ${m.cls}`}>
        <m.Icon className="h-4 w-4" />
        <span>Liberação: {m.label}</span>
      </div>

      <button
        onClick={onGerarChecklist}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#0b132b] text-white hover:bg-[#1b2a47] font-bold text-sm shadow-md shadow-slate-900/10 active:scale-98 transition"
      >
        <ClipboardPlus className="h-4 w-4 text-[#38bdf8]" />
        Gerar Checklist (1 clique)
      </button>

      {/* Infos */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs">
        <Info label="Local atual" valor={detalhe.localizacaoAtual} />
        <Info label="Validade cert." valor={fmtData(detalhe.validadeCertificado)} />
        <Info label="Fabricante" valor={detalhe.fabricante} />
        <Info label="Origem (sync)" valor={detalhe.syncStatus} />
      </div>

      {/* Certificados */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-2">
        <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-slate-400" /> Certificados ({certs.length})
        </h3>
        {certs.length === 0 ? (
          <p className="text-[11px] text-slate-400">Nenhum certificado registrado.</p>
        ) : (
          certs.map((c) => (
            <div key={c.id} className="flex justify-between items-center text-[11px] border-t border-slate-100 pt-2 first:border-0 first:pt-0">
              <div>
                <span className="font-bold text-slate-700">{c.tipo}</span>
                {c.numero && <span className="text-slate-400 ml-1.5">#{c.numero}</span>}
              </div>
              <span className="text-slate-500 font-semibold">{fmtData(c.validade)}</span>
            </div>
          ))
        )}
      </div>

      {/* Evidências */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-2">
        <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          📷 Evidências ({mediaList.length})
        </h3>
        {mediaList.length === 0 ? (
          <p className="text-[11px] text-slate-400">Nenhuma evidência registrada.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {mediaList.map((media, idx) => {
              const isVideo = media.type === 'video';
              return (
                <button
                  key={idx}
                  onClick={() => setLightboxMedia(media)}
                  className="relative aspect-square rounded-lg overflow-hidden border border-slate-100 bg-slate-50 hover:opacity-85 transition group"
                >
                  {isVideo ? (
                    <video src={api.mediaUrl(media.url)} className="object-cover w-full h-full" muted playsInline />
                  ) : (
                    <img src={api.mediaUrl(media.url)} alt={media.source} className="object-cover w-full h-full" />
                  )}
                  {media.type === 'signature' && (
                    <span className="absolute bottom-0 inset-x-0 bg-slate-900/60 text-[8px] text-white py-0.5 text-center font-bold font-mono">ASSINATURA</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-2">
        <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-slate-400" /> Histórico ({inspecoes.length})
        </h3>
        {inspecoes.length === 0 ? (
          <p className="text-[11px] text-slate-400">Nenhuma inspeção registrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {inspecoes.slice(0, 8).map((i) => (
              <Link
                key={i.id}
                to={`/inspecoes/${i.id}`}
                className="block p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-slate-300 transition duration-150 text-left"
              >
                <div className="flex justify-between items-start">
                  <span className="font-extrabold text-slate-800 text-[11px] block">
                    {i.numeroDocumento || 'Sem Número'}
                  </span>
                  <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded-full border uppercase ${
                    i.status === 'VALIDADA' ? 'bg-green-50 border-green-200 text-green-700' :
                    i.status === 'CONCLUIDA' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                    'bg-amber-50 border-amber-200 text-amber-700'
                  }`}>
                    {i.status}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 font-semibold">
                  <span>{new Date(i.data).toLocaleDateString('pt-BR')} ({i.tipo === 'PRE_EMBARQUE' ? 'Pré-Emb.' : i.tipo === 'OPERACIONAL' ? 'Operac.' : 'Retorno'})</span>
                  {i.validadaEm && (
                    <span className="text-[9px] text-slate-400 italic font-medium">Validado em {new Date(i.validadaEm).toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Dados brutos da planilha (transparência p/ Logística) */}
      <details className="bg-white border border-slate-200/80 rounded-2xl p-4">
        <summary className="text-xs font-extrabold text-slate-700 uppercase tracking-wider cursor-pointer">
          Dados originais da planilha
        </summary>
        <div className="mt-2 space-y-1">
          {Object.entries(dados).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-[10px] border-t border-slate-50 pt-1">
              <span className="text-slate-400 font-bold">{k}</span>
              <span className="text-slate-600 text-right break-all">{v == null ? '—' : String(v)}</span>
            </div>
          ))}
        </div>
      </details>

      {/* Lightbox fullscreen */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-4"
          onClick={() => setLightboxMedia(null)}
        >
          <button
            onClick={() => setLightboxMedia(null)}
            className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full shadow-lg transition"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="max-w-2xl w-full max-h-[80vh] flex items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
            {lightboxMedia.type === 'video' ? (
              <video src={api.mediaUrl(lightboxMedia.url)} controls autoPlay className="max-w-full max-h-[75vh] rounded-xl shadow-2xl" />
            ) : (
              <img src={api.mediaUrl(lightboxMedia.url)} alt={lightboxMedia.source} className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl" />
            )}
          </div>
          <p className="text-white text-xs font-bold mt-4 text-center max-w-lg bg-slate-900/60 px-4 py-2 rounded-xl border border-slate-800">
            {lightboxMedia.source}
          </p>
        </div>
      )}
    </div>
  );
};

const Info: React.FC<{ label: string; valor?: string | null }> = ({ label, valor }) => (
  <div>
    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    <span className="block text-slate-800 font-bold mt-0.5">{valor || '—'}</span>
  </div>
);

export default Equipamentos;
