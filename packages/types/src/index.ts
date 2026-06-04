// Status de cada item do checklist
export type StatusItem = 'OK' | 'PENDENTE' | 'NAO_APLICAVEL';

// Status da inspeção geral
export type StatusInspecao = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'VALIDADA' | 'CANCELADA';

// Tipo de inspeção
export type TipoInspecao = 'PRE_EMBARQUE' | 'OPERACIONAL' | 'RETORNO_EMBARQUE';

export interface User {
  id: string;
  nome: string;
  email: string;
  funcao?: string; // Ex: Operador, Supervisor, Gestor, Compras, Admin
  createdAt?: string;
  updatedAt?: string;
}

export interface Equipamento {
  id: string;
  codigo: string;
  nome: string;
  tipo: string; // Ex: After Cooler, Compressor, etc.
  localizacao?: string;
  status?: string; // Ex: Ativo, Manutenção, etc.
  createdAt?: string;
  updatedAt?: string;
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
}

export interface RespostaItem {
  id: string;
  inspecaoId: string;
  itemId: string;
  status: StatusItem;
  observacao?: string;
  responsavel?: string; // Quem executou aquela verificação
  certificadoId?: string;
  certificadoValidade?: string;
  fotoBase64?: string; // Mantido por compatibilidade
  pendenciaResolvida?: boolean; // Se a pendência foi resolvida em campo
  fotoResolvidaBase64?: string; // Foto da pendência resolvida
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
  responsavelGeral?: string;
  localizacao?: string;
  status: StatusInspecao;
  observacoesGerais?: string;
  createdById?: string;
  assinaturaBase64?: string; // Assinatura digital do encerramento
  equipamento?: Equipamento;
  respostas: RespostaItem[];
  materiais: MaterialUtilizado[];
  origem?: string;
  destino?: string;
  compressorUtilizado?: string;
  classificacao?: string;
  fotosEquipamento?: string[]; // Três fotos obrigatórias do equipamento
}
