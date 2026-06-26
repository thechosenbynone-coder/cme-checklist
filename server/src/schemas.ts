import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Informe CPF, nome ou e-mail.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

// ── User CRUD ─────────────────────────────────────────────────────

const funcaoSchema = z.enum(['OPERADOR', 'SUPERVISOR', 'GESTOR', 'ADMIN']);

const cpfField = z.string()
  .transform(v => v.replace(/\D/g, ''))
  .pipe(z.string().length(11, 'CPF deve ter 11 dígitos.'));

export const createUserSchema = z.object({
  nome: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres.'),
  cpf: cpfField.optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').optional(),
  funcao: funcaoSchema,
  senha: z.string().min(3, 'Senha deve ter ao menos 3 caracteres.'),
}).strict().refine(
  data => data.cpf || data.email,
  'Informe CPF ou e-mail — ao menos um identificador é obrigatório.'
);

export const updateUserSchema = z.object({
  nome: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres.').optional(),
  cpf: cpfField.optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').optional(),
  funcao: funcaoSchema.optional(),
  ativo: z.boolean().optional(),
}).strict().refine(
  data => Object.keys(data).length > 0,
  'Informe ao menos um campo para alteração.'
);

export const resetPasswordSchema = z.object({
  novaSenha: z.string().min(3, 'Senha deve ter ao menos 3 caracteres.'),
}).strict();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const respostaSchema = z.object({
  id: z.string().optional(),
  itemId: z.string(),
  status: z.enum(['OK', 'PENDENTE', 'NAO_APLICAVEL']).nullish(), // MEDICAO/TEXTO não têm status
  observacao: z.string().nullish(),
  responsavel: z.string().nullish(),
  valorNumerico: z.number().nullish(),
  valorTexto: z.string().nullish(),
  createdById: z.string().nullish(),
  fotoUrl: z.string().nullish(),
  fotosUrls: z.array(z.string()).max(6).nullish(),
  videoUrl: z.string().nullish(),
  fotoResolvidaUrl: z.string().nullish(),
  certificadoId: z.string().nullish(),
  certificadoValidade: z.string().nullish(),
  pendenciaResolvida: z.boolean().nullish(),
});

export const materialSchema = z.object({
  id: z.string().optional(),
  materialId: z.string(),
  quantidade: z.number(),
  observacao: z.string().nullish(),
});

export const inspecaoSchema = z.object({
  id: z.string().optional(),
  equipamentoId: z.string().min(1),
  tipo: z.enum(['PRE_EMBARQUE', 'OPERACIONAL', 'RETORNO_EMBARQUE']),
  data: z.string().nullish(),
  numeroDocumento: z.string().nullish(),
  modeloId: z.string().nullish(),
  modeloVersao: z.number().nullish(),
  responsavelGeral: z.string().nullish(),
  localizacao: z.string().nullish(),
  status: z.enum(['EM_ANDAMENTO', 'CONCLUIDA', 'VALIDADA', 'CANCELADA']),
  observacoesGerais: z.string().nullish(),
  createdById: z.string().nullish(),
  assinaturaUrl: z.string().nullish(),
  fotosUrls: z.array(z.string()).max(6).nullish(),
  videoUrl: z.string().nullish(),
  fotosEquipamento: z.array(z.string()).nullish(),
  origem: z.string().nullish(),
  destino: z.string().nullish(),
  compressorUtilizado: z.string().nullish(),
  classificacao: z.string().nullish(),
  respostas: z.array(respostaSchema).default([]),
  materiais: z.array(materialSchema).default([]),
});

export const modeloItemSchema = z.object({
  secao: z.string().min(1),
  descricao: z.string().min(1),
  ordem: z.number(),
  obrigatorio: z.boolean().default(true),
  tipo: z.enum(['STATUS', 'CERTIFICADO', 'MEDICAO', 'TEXTO']).default('STATUS'),
  unidade: z.string().nullish(),
});

export const modeloSchema = z.object({
  nome: z.string().min(1),
  tipoEquipamento: z.string().min(1),
  itens: z.array(modeloItemSchema).min(1, 'O modelo precisa de ao menos um item.'),
});

// PATCH granular: cada alteração traz o itemId + apenas os campos que mudaram.
// Campo ausente = não mexe; presente (mesmo null) = grava aquele valor.
export const respostaPatchSchema = z.object({
  itemId: z.string().min(1),
  status: z.enum(['OK', 'PENDENTE', 'NAO_APLICAVEL']).nullish(),
  observacao: z.string().nullish(),
  responsavel: z.string().nullish(),
  valorNumerico: z.number().nullish(),
  valorTexto: z.string().nullish(),
  certificadoId: z.string().nullish(),
  certificadoValidade: z.string().nullish(),
  pendenciaResolvida: z.boolean().nullish(),
  fotoUrl: z.string().nullish(),
  fotosUrls: z.array(z.string()).max(6).nullish(),
  videoUrl: z.string().nullish(),
  fotoResolvidaUrl: z.string().nullish(),
});

export const patchRespostasSchema = z.object({
  alteracoes: z.array(respostaPatchSchema).min(1, 'Informe ao menos uma alteração.'),
});

// Início server-side da inspeção (status EM_ANDAMENTO, sem respostas).
export const iniciarInspecaoSchema = z.object({
  equipamentoId: z.string().min(1),
  tipo: z.enum(['PRE_EMBARQUE', 'OPERACIONAL', 'RETORNO_EMBARQUE']),
  modeloId: z.string().nullish(),
  modeloVersao: z.number().nullish(),
  responsavelGeral: z.string().nullish(),
  origem: z.string().nullish(),
  destino: z.string().nullish(),
  compressorUtilizado: z.string().nullish(),
  classificacao: z.string().nullish(),
});
