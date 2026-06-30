import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { normalizeChave } from '../equipamentos/parsePlanilha.js';
import { calcularStatusLiberacao } from '../lib/equipamento.js';
import { paginationSchema } from '../schemas.js';

export const equipamentosRouter = Router();

// GET /api/equipamentos  (busca inteligente via ?busca=)
// Paginação é opt-in: só retorna o envelope {data,total,page,limit,totalPages}
// quando ?page ou ?limit são informados. Sem eles, mantém o array simples
// (compatibilidade com consumidores existentes — Dashboard web, seleção mobile).
equipamentosRouter.get('/api/equipamentos', async (req, res) => {
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    let where: any = {};
    if (busca) {
      const chave = normalizeChave(busca);
      where = {
        OR: [
          ...(chave ? [{ chaveBusca: { contains: chave } }] : []),
          { codigoExibicao: { contains: busca, mode: 'insensitive' } },
          { codigo: { contains: busca, mode: 'insensitive' } },
          { nome: { contains: busca, mode: 'insensitive' } },
          { tipo: { contains: busca, mode: 'insensitive' } },
          { localizacaoAtual: { contains: busca, mode: 'insensitive' } },
        ],
      };
    }

    const wantsPagination = req.query.page !== undefined || req.query.limit !== undefined;

    if (wantsPagination) {
      const { page, limit } = paginationSchema.parse(req.query);
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        prisma.equipamento.findMany({
          where,
          orderBy: { codigo: 'asc' },
          include: { _count: { select: { certificados: true, inspecoes: true } } },
          skip,
          take: limit,
        }),
        prisma.equipamento.count({ where }),
      ]);
      return res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
    }

    const data = await prisma.equipamento.findMany({
      where,
      orderBy: { codigo: 'asc' },
      include: { _count: { select: { certificados: true, inspecoes: true } } },
    });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching equipamentos:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/equipamentos/:id  (detalhe: certificados + histórico + status calculado)
equipamentosRouter.get('/api/equipamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const eq = await prisma.equipamento.findFirst({
      where: { OR: [{ id }, { codigo: id }] },
      include: {
        certificados: { orderBy: { validade: 'asc' } },
        inspecoes: {
          orderBy: { data: 'desc' },
          include: {
            respostas: true,
            createdBy: { select: { nome: true } },
            validadaPor: { select: { nome: true } },
          },
        },
      },
    });
    if (!eq) return res.status(404).json({ error: 'Equipamento não encontrado.' });
    res.json({ ...eq, statusLiberacao: calcularStatusLiberacao(eq) });
  } catch (error: any) {
    console.error('Error fetching equipamento details:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
