import { prisma } from './prisma.js';

export async function registrarAuditoria(
  userId: string | null | undefined,
  userNome: string | null | undefined,
  acao:
    | 'CRIAR_INSPECAO' | 'VALIDAR_INSPECAO' | 'EDITAR_TEMPLATE'
    | 'CRIAR_USUARIO' | 'EDITAR_USUARIO' | 'RESET_SENHA' | 'DESATIVAR_USUARIO' | 'REATIVAR_USUARIO',
  entidade: 'INSPECAO' | 'CHECKLIST_MODELO' | 'USER',
  entidadeId: string | null | undefined,
  detalhe?: any
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        userNome: userNome || null,
        acao,
        entidade,
        entidadeId: entidadeId || null,
        detalhe: detalhe || null,
      },
    });
  } catch (err) {
    console.error('Erro ao registrar log de auditoria:', err);
  }
}
