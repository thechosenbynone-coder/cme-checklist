import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const materiaisRouter = Router();

// GET /api/materiais
materiaisRouter.get('/api/materiais', async (_req, res) => {
  try {
    const data = await prisma.material.findMany({
      where: { ativo: true },
      orderBy: { descricao: 'asc' },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching materiais:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
