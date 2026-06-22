import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../auth.js';

// Rotas restritas a Gestor/Admin (ISO 9001).
export const adminRouter = Router();

// GET /api/users
adminRouter.get('/api/users', requireRole('GESTOR', 'ADMIN'), async (_req, res) => {
  try {
    const data = await prisma.user.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, email: true, funcao: true, ativo: true, createdAt: true },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/auditoria
adminRouter.get('/api/auditoria', requireRole('GESTOR', 'ADMIN'), async (req, res) => {
  try {
    const { entidade, entidadeId } = req.query;
    const where: any = {};
    if (typeof entidade === 'string' && entidade) {
      where.entidade = entidade;
    }
    if (typeof entidadeId === 'string' && entidadeId) {
      where.entidadeId = entidadeId;
    }
    const data = await prisma.auditLog.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 200,
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
