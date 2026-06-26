// Status de cada item do checklist
export type StatusItem = 'OK' | 'PENDENTE' | 'NAO_APLICAVEL';

// Tipo de item do checklist (builder tipado)
export type TipoItem = 'STATUS' | 'CERTIFICADO' | 'MEDICAO' | 'TEXTO';

// Status da inspeção geral
export type StatusInspecao = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'VALIDADA' | 'CANCELADA';

// Tipo de inspeção
export type TipoInspecao = 'PRE_EMBARQUE' | 'OPERACIONAL' | 'RETORNO_EMBARQUE';

// Funções de usuário (RBAC)
export type Funcao = 'OPERADOR' | 'SUPERVISOR' | 'GESTOR' | 'ADMIN';

// Envelope paginado para listagens
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Payloads de criação/edição de usuário
export interface CreateUserInput {
  nome: string;
  cpf?: string;
  email?: string;
  funcao: Funcao;
  senha: string;
}

export interface UpdateUserInput {
  nome?: string;
  cpf?: string;
  email?: string;
  funcao?: Funcao;
  ativo?: boolean;
}

// Relatório de integridade de uma inspeção (server calcula, web/mobile consomem)
export interface IntegridadeItemFaltante {
  itemId: string;
  secao: string;
  descricao: string;
}

export interface IntegridadeEvidenciaFaltante {
  itemId: string;
  descricao: string;
  motivo: string;
}

export interface IntegridadeCertificadoVencido {
  itemId: string;
  descricao: string;
}

export interface IntegridadeReport {
  completude: number; // 0-100%
  totalItens: number;
  itensRespondidos: number;
  itensObrigatoriosPendentes: IntegridadeItemFaltante[];
  evidenciasFaltantes: IntegridadeEvidenciaFaltante[];
  certificadosVencidos: IntegridadeCertificadoVencido[];
  temAssinatura: boolean;
  temFotosOuVideoEquipamento: boolean;
  aprovado: boolean;
}

export interface User {
  id: string;
  nome: string;
  cpf?: string;
  email?: string;
  funcao?: string;
  ativo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Equipamento {
  id: string;
  codigo: string;                 // código canônico (com hífen) — chave de negócio
  codigoExibicao?: string;        // código original da planilha
  chaveBusca?: string;            // normalizado (só alfanumérico) p/ busca inteligente
  nome: string;
  tipo: string; // Ex: After Cooler, Compressor, etc.
  fabricante?: string;
  localizacao?: string;
  localizacaoAtual?: string;      // coluna ATUAL da planilha
  estado?: string;
  status?: string; // Ex: Ativo, Manutenção, etc.
  statusLiberacao?: 'PENDENTE' | 'LIBERADO' | 'VENCIDO';
  validadeCertificado?: string;
  arquivoCertDriveUrl?: string;
  dadosPlanilha?: Record<string, unknown>; // preserva TODAS as colunas da planilha
  syncStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  certificados?: Certificado[];
}

export interface Certificado {
  id: string;
  equipamentoId: string;
  tipo: string;            // EQUIPAMENTO | ESLINGA | PSV | MANOMETRO | NR13 | CONTAINER ...
  numero?: string;
  emissao?: string;
  validade?: string;
  orgaoEmissor?: string;
  arquivoUrl?: string;
  createdAt?: string;
}

export interface ChecklistModelo {
  id: string;
  nome: string;
  tipoEquipamento: string;
  versao: number;
  ativo: boolean;
  createdAt?: string;
  itens?: ItemChecklist[];
}

export interface ItemChecklist {
  id: string;
  modeloId: string;
  secao: string; // Ex: "INSPEÇÃO GERAL", "SISTEMA PNEUMÁTICO", etc.
  descricao: string;
  ordem: number;
  obrigatorio: boolean;
  tipo: TipoItem;       // STATUS | CERTIFICADO | MEDICAO | TEXTO
  unidade?: string;     // p/ MEDICAO: '°C', 'A', 'bar'
}

export interface RespostaItem {
  id: string;
  inspecaoId: string;
  itemId: string;
  status?: StatusItem;  // opcional: MEDICAO/TEXTO não têm OK/Pendente/N-A
  observacao?: string;
  responsavel?: string; // Quem executou aquela verificação
  valorNumerico?: number; // MEDICAO (temperatura, amperagem)
  valorTexto?: string;    // TEXTO (observações livres)
  certificadoId?: string;
  certificadoValidade?: string;
  /** @deprecated Use fotoUrl instead */
  fotoBase64?: string; // Mantido por compatibilidade
  fotoUrl?: string; // URL do Drive (produção)
  fotosUrls?: string[]; // evidências por pergunta (até 6)
  videoUrl?: string; // vídeo de evidência (separado de fotosUrls)
  pendenciaResolvida?: boolean; // Se a pendência foi resolvida em campo
  /** @deprecated Use fotoResolvidaUrl instead */
  fotoResolvidaBase64?: string; // Foto da pendência resolvida
  fotoResolvidaUrl?: string; // URL do Drive (produção)
  createdById?: string;
  item?: ItemChecklist;
}



export interface Material {
  id: string;
  codigo?: string;
  descricao: string;
  unidade: string; // UN, KG, M, etc.
  categoria?: string;
  ativo: boolean;
  createdAt?: string;
}

export interface MaterialUtilizado {
  id: string;
  inspecaoId: string;
  materialId: string;
  quantidade: number;
  observacao?: string;
  material?: Material;
}

export interface Inspecao {
  id: string;
  equipamentoId: string;
  tipo: TipoInspecao;
  data: string; // ISO String
  numeroDocumento?: string; // registro único rastreável (ISO 9001)
  modeloId?: string;     // versão do template usada (ISO 9001 — rastreabilidade)
  modeloVersao?: number;
  validadaPorId?: string;
  validadaEm?: string;
  validadaPor?: { nome: string }; // relação carregada pelo servidor (GET /inspecoes/:id)
  responsavelGeral?: string;
  localizacao?: string;
  status: StatusInspecao;
  observacoesGerais?: string;
  createdById?: string;
  /** @deprecated Use assinaturaUrl instead */
  assinaturaBase64?: string; // Assinatura digital do encerramento
  assinaturaUrl?: string; // URL do Drive (produção)
  equipamento?: Equipamento;
  respostas: RespostaItem[];
  materiais: MaterialUtilizado[];
  origem?: string;
  destino?: string;
  compressorUtilizado?: string;
  classificacao?: string;
  fotosEquipamento?: string[]; // Três fotos obrigatórias do equipamento
  fotosUrls?: string[]; // URLs do Drive (produção)
  videoUrl?: string; // vídeo geral do equipamento (separado de fotosUrls)
}

// Util central de normalização 
// Texto livre (responsável, origem, destino, observações, códigos) em MAIÚSCULAS.
export const maiusculas = (s?: string | null): string | undefined => {
  if (s == null) return undefined;
  const t = String(s).trim();
  return t ? t.toLocaleUpperCase('pt-BR') : undefined;
};