import React, { useEffect, useMemo, useState } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  Save,
  FilePlus2,
  History,
  Loader2,
  CheckCircle2,
  Users,
  UserPlus,
  Pencil,
  KeyRound,
  X,
  AlertCircle,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import api, { ApiError } from '../services/api';
import { ChecklistModelo, ItemChecklist, TipoItem, User, Funcao } from '@cme/types';

// Auto-dismiss padrão para banners de sucesso (erros são persistentes).
const SUCCESS_DISMISS_MS = 4000;

type ItemEdit = {
  secao: string;
  descricao: string;
  ordem: number;
  obrigatorio: boolean;
  tipo: TipoItem;
  unidade?: string;
};

const TIPOS: { v: TipoItem; label: string }[] = [
  { v: 'STATUS', label: 'Status (OK/Pend./N-A)' },
  { v: 'CERTIFICADO', label: 'Certificado (ID/Validade)' },
  { v: 'MEDICAO', label: 'Medição (valor + unidade)' },
  { v: 'TEXTO', label: 'Texto / Observação' },
];

const TIPO_CLS: Record<string, string> = {
  STATUS: 'bg-[#0b132b] text-white',
  CERTIFICADO: 'bg-indigo-600 text-white',
  MEDICAO: 'bg-sky-600 text-white',
  TEXTO: 'bg-slate-600 text-white',
};

export const Configuracoes: React.FC = () => {
  const currentUser = useMemo(() => api.auth.currentUser(), []);
  const showAuditoriaTab = currentUser?.funcao === 'GESTOR' || currentUser?.funcao === 'ADMIN';
  const [tab, setTab] = useState<'modelos' | 'usuarios' | 'auditoria'>('modelos');
  const [modelos, setModelos] = useState<ChecklistModelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  // Form de edição (gera nova versão ao salvar)
  const [nome, setNome] = useState('');
  const [tipoEquipamento, setTipoEquipamento] = useState('');
  const [itens, setItens] = useState<ItemEdit[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [novo, setNovo] = useState(false);

  const carregarLista = () => {
    setLoading(true);
    api.modelos
      .list()
      .then((data) => setModelos(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    carregarLista();
  }, []);

  const selecionar = async (id: string) => {
    setNovo(false);
    setMsg('');
    setSelecionadoId(id);
    const m = await api.modelos.get(id);
    setNome(m.nome);
    setTipoEquipamento(m.tipoEquipamento);
    setItens(
      (m.itens || []).map((it: ItemChecklist) => ({
        secao: it.secao,
        descricao: it.descricao,
        ordem: it.ordem,
        obrigatorio: it.obrigatorio,
        tipo: (it.tipo as TipoItem) || 'STATUS',
        unidade: it.unidade || '',
      }))
    );
  };

  const novoTemplate = () => {
    setNovo(true);
    setSelecionadoId(null);
    setMsg('');
    setNome('');
    setTipoEquipamento('');
    setItens([{ secao: '', descricao: '', ordem: 1, obrigatorio: true, tipo: 'STATUS', unidade: '' }]);
  };

  const atualizarItem = (idx: number, patch: Partial<ItemEdit>) => {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removerItem = (idx: number) =>
    setItens((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, ordem: i + 1 })));
  const adicionarItem = () =>
    setItens((prev) => [
      ...prev,
      {
        secao: prev[prev.length - 1]?.secao || '',
        descricao: '',
        ordem: prev.length + 1,
        obrigatorio: true,
        tipo: 'STATUS',
        unidade: '',
      },
    ]);

  const salvar = async () => {
    setMsg('');
    if (!nome.trim() || !tipoEquipamento.trim()) {
      setMsg('Informe nome e tipo de equipamento.');
      return;
    }
    if (itens.length === 0 || itens.some((it) => !it.descricao.trim() || !it.secao.trim())) {
      setMsg('Todos os itens precisam de seção e descrição.');
      return;
    }
    setSalvando(true);
    try {
      const novoModelo = await api.modelos.save({
        nome: nome.trim(),
        tipoEquipamento: tipoEquipamento.trim(),
        itens: itens.map((it, i) => ({
          secao: it.secao.trim(),
          descricao: it.descricao.trim(),
          ordem: i + 1,
          obrigatorio: it.obrigatorio,
          tipo: it.tipo,
          unidade: it.tipo === 'MEDICAO' ? it.unidade || null : null,
        })),
      });
      setMsg('Nova versão salva com sucesso!');
      setNovo(false);
      carregarLista();
      setSelecionadoId(novoModelo.id);
    } catch (e: any) {
      setMsg(e?.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  // Agrupa por tipoEquipamento
  const grupos = useMemo(() => {
    const g: Record<string, ChecklistModelo[]> = {};
    for (const m of modelos) {
      (g[m.tipoEquipamento] = g[m.tipoEquipamento] || []).push(m);
    }
    return g;
  }, [modelos]);

  const emEdicao = novo || !!selecionadoId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight flex items-center gap-2">
          <Settings className="h-7 w-7 text-[#38bdf8]" /> Configurações
        </h1>
        <p className="text-[11px] text-slate-400 mt-1 font-semibold uppercase tracking-wide">
          Builder de checklists tipados · versionamento ISO 9001
        </p>
      </div>

      {showAuditoriaTab && (
        <div className="flex gap-2 border-b border-slate-200/50 pb-2">
          <button
            onClick={() => setTab('modelos')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 ${
              tab === 'modelos'
                ? 'bg-[#0b132b] text-white shadow-sm'
                : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200/60'
            }`}
          >
            Modelos de Checklist
          </button>
          <button
            onClick={() => setTab('usuarios')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
              tab === 'usuarios'
                ? 'bg-[#0b132b] text-white shadow-sm'
                : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200/60'
            }`}
          >
            <Users className="h-3.5 w-3.5" /> Gestão de Usuários
          </button>
          <button
            onClick={() => setTab('auditoria')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 ${
              tab === 'auditoria'
                ? 'bg-[#0b132b] text-white shadow-sm'
                : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200/60'
            }`}
          >
            Trilha de Auditoria (ISO 9001)
          </button>
        </div>
      )}

      {tab === 'usuarios' ? (
        <GestaoUsuarios atorFuncao={(currentUser?.funcao || 'OPERADOR') as Funcao} atorId={currentUser?.id || ''} />
      ) : tab === 'modelos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de templates */}
          <div className="lg:col-span-1 space-y-3">
            <button
              onClick={novoTemplate}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-[#0b132b] text-white hover:bg-[#1b2a47] text-xs font-bold shadow-sm"
            >
              <FilePlus2 className="h-4 w-4 text-[#38bdf8]" /> Novo Template
            </button>

            {loading ? (
              <div className="text-center text-slate-400 text-sm py-8">Carregando...</div>
            ) : (
              Object.entries(grupos).map(([tipo, versoes]) => (
                <div key={tipo} className="bg-white border border-slate-200/80 rounded-3xl p-4 shadow-sm">
                  <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">{tipo}</h3>
                  <div className="space-y-1.5">
                    {versoes.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => selecionar(m.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition flex items-center justify-between ${
                          selecionadoId === m.id
                            ? 'bg-[#0b132b] text-white border-[#0b132b]'
                            : 'bg-slate-50 border-slate-150 hover:border-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <History className="h-3.5 w-3.5 opacity-70" /> v{m.versao}
                          {m.ativo && (
                            <span className={`ml-1 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full ${selecionadoId === m.id ? 'bg-[#38bdf8] text-[#0b132b]' : 'bg-green-100 text-green-700'}`}>
                              ATIVA
                            </span>
                          )}
                        </span>
                        <span className="opacity-60">{(m as any)._count?.itens ?? m.itens?.length ?? 0} itens</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Editor */}
          <div className="lg:col-span-2">
            {!emEdicao ? (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-10 text-center text-slate-400 text-sm">
                Selecione um template para ver/editar, ou crie um novo. Salvar gera uma <strong>nova versão</strong> (a anterior é preservada para as inspeções antigas).
              </div>
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do template</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Checklist Operacional de Liberação de After Cooler"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo de equipamento</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                      value={tipoEquipamento}
                      onChange={(e) => setTipoEquipamento(e.target.value)}
                      placeholder="After Cooler"
                      disabled={!novo}
                    />
                  </div>
                </div>

                {/* Itens */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Itens ({itens.length})</span>
                    <button onClick={adicionarItem} className="flex items-center gap-1 text-xs font-bold text-[#0b132b] hover:text-[#1b2a47]">
                      <Plus className="h-3.5 w-3.5" /> Adicionar item
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                    {itens.map((it, idx) => (
                      <div key={idx} className="border border-slate-150 rounded-2xl p-3 bg-slate-50/50 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] font-extrabold text-slate-400 mt-2 w-6 text-center">{idx + 1}</span>
                          <div className="flex-1 space-y-2">
                            <input
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wide outline-none focus:ring-2 focus:ring-blue-100"
                              value={it.secao}
                              onChange={(e) => atualizarItem(idx, { secao: e.target.value })}
                              placeholder="SEÇÃO (ex: INSPEÇÃO GERAL)"
                            />
                            <textarea
                              rows={2}
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-100"
                              value={it.descricao}
                              onChange={(e) => atualizarItem(idx, { descricao: e.target.value })}
                              placeholder="Descrição do item"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={it.tipo}
                                onChange={(e) => atualizarItem(idx, { tipo: e.target.value as TipoItem })}
                                className={`text-[10px] font-bold rounded-lg px-2 py-1 outline-none ${TIPO_CLS[it.tipo]}`}
                              >
                                {TIPOS.map((t) => (
                                  <option key={t.v} value={t.v} className="bg-white text-slate-800">
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                              {it.tipo === 'MEDICAO' && (
                                <input
                                  className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-blue-100"
                                  value={it.unidade || ''}
                                  onChange={(e) => atualizarItem(idx, { unidade: e.target.value })}
                                  placeholder="Unid. (°C, A)"
                                />
                              )}
                              <label className="flex items-center gap-1 text-[11px] text-slate-600 font-semibold">
                                <input
                                  type="checkbox"
                                  checked={it.obrigatorio}
                                  onChange={(e) => atualizarItem(idx, { obrigatorio: e.target.checked })}
                                />
                                Obrigatório
                              </label>
                            </div>
                          </div>
                          <button
                            onClick={() => removerItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg mt-1"
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {msg && (
                  <p className={`text-xs text-center font-semibold ${msg.includes('sucesso') ? 'text-green-600' : 'text-red-600'}`}>
                    {msg.includes('sucesso') && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />}
                    {msg}
                  </p>
                )}

                <button
                  onClick={salvar}
                  disabled={salvando}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#0b132b] text-white hover:bg-[#1b2a47] text-sm font-bold shadow-md disabled:opacity-60"
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-[#38bdf8]" />}
                  Salvar (gera nova versão)
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <TrilhaAuditoria />
      )}
    </div>
  );
};

const TrilhaAuditoria: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entidade, setEntidade] = useState('');
  const [erro, setErro] = useState('');

  const carregarLogs = () => {
    setLoading(true);
    setErro('');
    api.auditoria
      .list(entidade || undefined)
      .then((res) => setLogs(res.data))
      .catch((e) => setErro(e.message || 'Erro ao carregar logs.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    carregarLogs();
  }, [entidade]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">Trilha de Auditoria ISO 9001</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Logs históricos de criação de inspeções, validação de checklist e edição de templates.</p>
        </div>
        <div>
          <select
            value={entidade}
            onChange={(e) => setEntidade(e.target.value)}
            className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
          >
            <option value="">Todas as entidades</option>
            <option value="INSPECAO">Inspeções</option>
            <option value="CHECKLIST_MODELO">Modelos de Checklist</option>
            <option value="USER">Usuários</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs font-semibold">Carregando trilha de auditoria...</div>
      ) : erro ? (
        <div className="text-center py-12 text-red-500 text-xs font-semibold">{erro}</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-xs font-semibold">Nenhum log de auditoria registrado.</div>
      ) : (
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 text-[9px] font-extrabold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Data / Hora</th>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">ID Relacionado</th>
                <th className="px-4 py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/55 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-500">
                    {new Date(log.criadoEm).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-800">
                    {log.userNome || 'Sistema / API'}
                    {log.userId && <span className="block text-[8px] text-slate-400 font-mono mt-0.5">{log.userId}</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase ${
                      log.acao === 'CRIAR_INSPECAO' || log.acao === 'CRIAR_USUARIO' ? 'bg-blue-50 border border-blue-200 text-blue-700' :
                      log.acao === 'VALIDAR_INSPECAO' || log.acao === 'REATIVAR_USUARIO' ? 'bg-green-50 border border-green-200 text-green-700' :
                      log.acao === 'DESATIVAR_USUARIO' ? 'bg-red-50 border border-red-200 text-red-700' :
                      log.acao === 'RESET_SENHA' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                      'bg-indigo-50 border border-indigo-200 text-indigo-700'
                    }`}>
                      {log.acao.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-600">
                    {log.entidade}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-[9px] text-slate-400">
                    {log.entidadeId || '—'}
                  </td>
                  <td className="px-4 py-3 max-w-xs break-words text-[10px] text-slate-505 font-semibold font-mono bg-slate-50/50">
                    {log.detalhe ? JSON.stringify(log.detalhe) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Gestão de Usuários ────────────────────────────────────────────

const FUNCAO_CLS: Record<string, string> = {
  OPERADOR: 'bg-slate-100 text-slate-700 border border-slate-200',
  SUPERVISOR: 'bg-sky-50 text-sky-700 border border-sky-200',
  GESTOR: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  ADMIN: 'bg-amber-50 text-amber-700 border border-amber-200',
};

const FUNCAO_LABEL: Record<string, string> = {
  OPERADOR: 'Operador',
  SUPERVISOR: 'Supervisor',
  GESTOR: 'Gestor',
  ADMIN: 'Admin',
};

const formatCpf = (cpf?: string): string => {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

// Quais funções o ator pode atribuir (espelha a regra do backend).
const funcoesAtribuiveis = (ator: Funcao): Funcao[] => {
  if (ator === 'ADMIN') return ['OPERADOR', 'SUPERVISOR', 'GESTOR', 'ADMIN'];
  if (ator === 'GESTOR') return ['OPERADOR', 'SUPERVISOR'];
  return [];
};

const podeGerenciar = (ator: Funcao, alvo?: string): boolean => {
  if (ator === 'ADMIN') return true;
  if (ator === 'GESTOR') return alvo === 'OPERADOR' || alvo === 'SUPERVISOR';
  return false;
};

type Feedback = { type: 'success' | 'error'; text: string } | null;

const FeedbackBanner: React.FC<{ feedback: Feedback; onClose: () => void }> = ({ feedback, onClose }) => {
  if (!feedback) return null;
  const ok = feedback.type === 'success';
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-xs font-semibold ${
        ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
      }`}
    >
      <span className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
        {feedback.text}
      </span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100" title="Fechar">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const GestaoUsuarios: React.FC<{ atorFuncao: Funcao; atorId: string }> = ({ atorFuncao, atorId }) => {
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const limit = 20;

  const carregar = (p = page) => {
    setLoading(true);
    api.users
      .list(p, limit)
      .then((res) => {
        setUsuarios(res.data);
        setTotalPages(res.totalPages);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch((e) => setFeedback({ type: 'error', text: e?.message || 'Erro ao carregar usuários.' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    carregar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss de sucesso; erros persistem até o usuário fechar.
  useEffect(() => {
    if (feedback?.type === 'success') {
      const t = setTimeout(() => setFeedback(null), SUCCESS_DISMISS_MS);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  const abrirNovo = () => {
    setEditando(null);
    setFormOpen(true);
  };
  const abrirEdicao = (u: User) => {
    setEditando(u);
    setFormOpen(true);
  };

  const onSaved = (msg: string) => {
    setFormOpen(false);
    setFeedback({ type: 'success', text: msg });
    carregar();
  };
  const onResetDone = (msg: string) => {
    setResetUser(null);
    setFeedback({ type: 'success', text: msg });
  };

  const toggleAtivo = async (u: User) => {
    setTogglingId(u.id);
    setFeedback(null);
    try {
      await api.users.update(u.id, { ativo: !u.ativo });
      setFeedback({ type: 'success', text: `Usuário ${u.ativo ? 'desativado' : 'reativado'} com sucesso.` });
      carregar();
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Erro ao alterar status do usuário.' });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">Usuários do sistema</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Crie e gerencie operadores, supervisores e gestores. Login por CPF, nome ou e-mail.
          </p>
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0b132b] text-white hover:bg-[#1b2a47] text-xs font-bold shadow-sm shrink-0"
        >
          <UserPlus className="h-4 w-4 text-[#38bdf8]" /> Novo Usuário
        </button>
      </div>

      <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />

      <div className="bg-white border border-slate-200/80 rounded-3xl p-2 shadow-sm">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Carregando usuários...</div>
        ) : usuarios.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Nenhum usuário cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
              <thead className="text-slate-500 text-[9px] font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">CPF</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Função</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {usuarios.map((u) => {
                  const gerenciavel = podeGerenciar(atorFuncao, u.funcao);
                  const isSelf = u.id === atorId;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/55 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-800">
                        {u.nome}
                        {isSelf && <span className="ml-2 text-[8px] text-slate-400 font-extrabold uppercase">(você)</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{formatCpf(u.cpf)}</td>
                      <td className="px-4 py-3 text-slate-500">{u.email || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase ${FUNCAO_CLS[u.funcao || 'OPERADOR']}`}>
                          {FUNCAO_LABEL[u.funcao || 'OPERADOR']}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${u.ativo ? 'text-green-600' : 'text-red-500'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${u.ativo ? 'bg-green-500' : 'bg-red-400'}`} />
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {gerenciavel && (
                            <button
                              onClick={() => abrirEdicao(u)}
                              className="p-1.5 text-slate-400 hover:text-[#0b132b] hover:bg-slate-100 rounded-lg"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {(gerenciavel || isSelf) && (
                            <button
                              onClick={() => setResetUser(u)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                              title="Redefinir senha"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {gerenciavel && !isSelf && (
                            <button
                              onClick={() => toggleAtivo(u)}
                              disabled={togglingId === u.id}
                              className={`p-1.5 rounded-lg disabled:opacity-50 ${
                                u.ativo
                                  ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                                  : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                              title={u.ativo ? 'Desativar' : 'Reativar'}
                            >
                              {togglingId === u.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : u.ativo ? (
                                <ShieldX className="h-3.5 w-3.5" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-400 font-semibold">
            {total} usuário{total !== 1 ? 's' : ''} · página {page} de {totalPages}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => carregar(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
            >
              Anterior
            </button>
            <button
              onClick={() => carregar(page + 1)}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {formOpen && (
        <UserFormModal
          user={editando}
          atorFuncao={atorFuncao}
          onClose={() => setFormOpen(false)}
          onSaved={onSaved}
        />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onDone={onResetDone} />
      )}
    </div>
  );
};

const UserFormModal: React.FC<{
  user: User | null;
  atorFuncao: Funcao;
  onClose: () => void;
  onSaved: (msg: string) => void;
}> = ({ user, atorFuncao, onClose, onSaved }) => {
  const editMode = !!user;
  const [nome, setNome] = useState(user?.nome || '');
  const [cpf, setCpf] = useState(user?.cpf ? formatCpf(user.cpf) : '');
  const [email, setEmail] = useState(user?.email || '');
  const [funcao, setFuncao] = useState<Funcao>((user?.funcao as Funcao) || 'OPERADOR');
  const [senha, setSenha] = useState('');
  const [ativo, setAtivo] = useState(user?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const opcoesFuncao = funcoesAtribuiveis(atorFuncao);

  const salvar = async () => {
    setErro('');
    if (!nome.trim() || nome.trim().length < 2) {
      setErro('Informe um nome com ao menos 2 caracteres.');
      return;
    }
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpf && cpfLimpo.length !== 11) {
      setErro('CPF deve ter 11 dígitos.');
      return;
    }
    if (!editMode && !cpfLimpo && !email.trim()) {
      setErro('Informe CPF ou e-mail — ao menos um identificador é obrigatório.');
      return;
    }
    if (!editMode && senha.trim().length < 3) {
      setErro('Senha deve ter ao menos 3 caracteres.');
      return;
    }

    setSalvando(true);
    try {
      if (editMode && user) {
        await api.users.update(user.id, {
          nome: nome.trim(),
          cpf: cpfLimpo || undefined,
          email: email.trim() || undefined,
          funcao,
          ativo,
        });
        onSaved('Usuário atualizado com sucesso.');
      } else {
        await api.users.create({
          nome: nome.trim(),
          cpf: cpfLimpo || undefined,
          email: email.trim() || undefined,
          funcao,
          senha: senha.trim(),
        });
        onSaved('Usuário criado com sucesso.');
      }
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : e?.message || 'Erro ao salvar usuário.';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            {editMode ? <Pencil className="h-4 w-4 text-[#38bdf8]" /> : <UserPlus className="h-4 w-4 text-[#38bdf8]" />}
            {editMode ? 'Editar usuário' : 'Novo usuário'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome completo</label>
            <input
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: João da Silva"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">CPF</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">E-mail (opcional)</label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="opcional@cme.local"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Função</label>
              <select
                value={funcao}
                onChange={(e) => setFuncao(e.target.value as Funcao)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
              >
                {opcoesFuncao.map((f) => (
                  <option key={f} value={f}>{FUNCAO_LABEL[f]}</option>
                ))}
              </select>
            </div>
            {!editMode && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Senha</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 3 caracteres"
                />
              </div>
            )}
          </div>
          {editMode && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              Usuário ativo (pode fazer login)
            </label>
          )}
        </div>

        {erro && (
          <p className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {erro}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-[#0b132b] text-white hover:bg-[#1b2a47] text-sm font-bold shadow-md disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-[#38bdf8]" />}
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ResetPasswordModal: React.FC<{
  user: User;
  onClose: () => void;
  onDone: (msg: string) => void;
}> = ({ user, onClose, onDone }) => {
  const [novaSenha, setNovaSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async () => {
    setErro('');
    if (novaSenha.trim().length < 3) {
      setErro('Senha deve ter ao menos 3 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      await api.users.resetPassword(user.id, novaSenha.trim());
      onDone(`Senha de ${user.nome} redefinida com sucesso.`);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao redefinir senha.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#38bdf8]" /> Redefinir senha
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Nova senha para <strong className="text-slate-700">{user.nome}</strong>.
        </p>
        <input
          type="password"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          placeholder="Mínimo 3 caracteres"
          autoFocus
        />
        {erro && (
          <p className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {erro}
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-[#0b132b] text-white hover:bg-[#1b2a47] text-sm font-bold shadow-md disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 text-[#38bdf8]" />}
            {salvando ? 'Salvando...' : 'Redefinir'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Configuracoes;
