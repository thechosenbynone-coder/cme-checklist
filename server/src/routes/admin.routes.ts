import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireRole, hashSenha, type Funcao } from '../auth.js';
import { registrarAuditoria } from '../lib/audit.js';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  paginationSchema,
} from '../schemas.js';

export const adminRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────

const userPublicSelect = {
  id: true,
  nome: true,
  cpf: true,
  email: true,
  funcao: true,
  ativo: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

function podeGerenciarUsuario(ator: string, alvo: string | null | undefined): boolean {
  if (ator === 'ADMIN') return true;
  if (ator === 'GESTOR') return alvo === 'OPERADOR' || alvo === 'SUPERVISOR';
  return false;
}

function podeAtribuirFuncao(ator: string, funcao: string): boolean {
  if (ator === 'ADMIN') return true;
  if (ator === 'GESTOR') return funcao === 'OPERADOR' || funcao === 'SUPERVISOR';
  return false;
}

// ── GET /api/users (paginado) ─────────────────────────────────────

adminRouter.get('/api/users', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { nome: 'asc' },
        select: userPublicSelect,
      }),
      prisma.user.count(),
    ]);

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── POST /api/users ───────────────────────────────────────────────

adminRouter.post('/api/users', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    }

    const { nome, cpf, email, funcao, senha } = parsed.data;
    const atorFuncao = req.user!.funcao;

    if (!podeAtribuirFuncao(atorFuncao, funcao)) {
      return res.status(403).json({ error: 'Você não tem permissão para criar usuários com esta função.' });
    }

    const senhaHash = await hashSenha(senha);

    const user = await prisma.user.create({
      data: {
        nome,
        cpf: cpf || null,
        email: email || null,
        funcao,
        senhaHash,
        ativo: true,
      },
      select: userPublicSelect,
    });

    await registrarAuditoria(req.user!.sub, req.user!.nome, 'CRIAR_USUARIO', 'USER', user.id, { funcao });

    res.status(201).json(user);
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Já existe um usuário com este CPF ou e-mail.' });
    }
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── PATCH /api/users/:id ──────────────────────────────────────────

adminRouter.patch('/api/users/:id', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    }

    const alvo = await prisma.user.findUnique({ where: { id }, select: { ...userPublicSelect, funcao: true } });
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const atorFuncao = req.user!.funcao;

    if (!podeGerenciarUsuario(atorFuncao, alvo.funcao)) {
      return res.status(403).json({ error: 'Você não tem permissão para editar este usuário.' });
    }

    const updates = parsed.data;

    if (updates.funcao && !podeAtribuirFuncao(atorFuncao, updates.funcao)) {
      return res.status(403).json({ error: 'Você não tem permissão para atribuir esta função.' });
    }

    // Proteção: não desativar nem rebaixar o último ADMIN
    const removePrivilegioAdmin =
      alvo.funcao === 'ADMIN' &&
      (updates.ativo === false || (updates.funcao !== undefined && updates.funcao !== 'ADMIN'));

    if (removePrivilegioAdmin) {
      const adminsAtivos = await prisma.user.count({ where: { funcao: 'ADMIN', ativo: true } });
      if (adminsAtivos <= 1) {
        return res.status(409).json({ error: 'Não é possível desativar ou rebaixar o último administrador ativo.' });
      }
    }

    const atualizado = await prisma.user.update({
      where: { id },
      data: {
        ...(updates.nome !== undefined && { nome: updates.nome }),
        ...(updates.cpf !== undefined && { cpf: updates.cpf || null }),
        ...(updates.email !== undefined && { email: updates.email || null }),
        ...(updates.funcao !== undefined && { funcao: updates.funcao }),
        ...(updates.ativo !== undefined && { ativo: updates.ativo }),
      },
      select: userPublicSelect,
    });

    // Auditoria granular
    const foiDesativado = alvo.ativo === true && updates.ativo === false;
    const foiReativado = alvo.ativo === false && updates.ativo === true;
    const acao = foiDesativado ? 'DESATIVAR_USUARIO' as const
      : foiReativado ? 'REATIVAR_USUARIO' as const
      : 'EDITAR_USUARIO' as const;

    const alteracoes: Record<string, { anterior: any; novo: any }> = {};
    if (updates.nome !== undefined && updates.nome !== alvo.nome) alteracoes.nome = { anterior: alvo.nome, novo: updates.nome };
    if (updates.cpf !== undefined && updates.cpf !== alvo.cpf) alteracoes.cpf = { anterior: alvo.cpf, novo: updates.cpf };
    if (updates.email !== undefined && updates.email !== alvo.email) alteracoes.email = { anterior: alvo.email, novo: updates.email };
    if (updates.funcao !== undefined && updates.funcao !== alvo.funcao) alteracoes.funcao = { anterior: alvo.funcao, novo: updates.funcao };
    if (updates.ativo !== undefined && updates.ativo !== alvo.ativo) alteracoes.ativo = { anterior: alvo.ativo, novo: updates.ativo };

    await registrarAuditoria(req.user!.sub, req.user!.nome, acao, 'USER', id, { alteracoes });

    res.json(atualizado);
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Já existe um usuário com este CPF ou e-mail.' });
    }
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── POST /api/users/:id/reset-password ────────────────────────────

adminRouter.post('/api/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const isSelf = req.user.sub === id;

    if (!isSelf) {
      const alvo = await prisma.user.findUnique({ where: { id }, select: { funcao: true } });
      if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (!podeGerenciarUsuario(req.user.funcao, alvo.funcao)) {
        return res.status(403).json({ error: 'Você não tem permissão para redefinir a senha deste usuário.' });
      }
    }

    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    }

    const senhaHash = await hashSenha(parsed.data.novaSenha);
    await prisma.user.update({ where: { id }, data: { senhaHash } });

    await registrarAuditoria(req.user.sub, req.user.nome, 'RESET_SENHA', 'USER', id);

    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── GET /api/auditoria (paginado) ─────────────────────────────────

adminRouter.get('/api/auditoria', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const { entidade, entidadeId } = req.query;
    const where: any = {};
    if (typeof entidade === 'string' && entidade) where.entidade = entidade;
    if (typeof entidadeId === 'string' && entidadeId) where.entidadeId = entidadeId;

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
