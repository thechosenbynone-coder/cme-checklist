import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ── Papéis (RBAC) ──────────────────────────────────────────────────
export type Funcao = 'OPERADOR' | 'SUPERVISOR' | 'GESTOR' | 'ADMIN';

export interface TokenPayload {
  sub: string; // id do usuário
  nome: string;
  funcao: Funcao;
}

// Augmenta o Request do Express com o usuário autenticado
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Falha cedo: sem segredo não há como assinar/verificar tokens com segurança.
  throw new Error('JWT_SECRET não está definido nas variáveis de ambiente.');
}

// Validação robusta do segredo (Ajuste 2)
const _trimmed = JWT_SECRET.trim();
const _isWeak =
  _trimmed.length === 0 ||
  _trimmed.length < 32 ||
  /sua-chave-secreta|changeme|your-?secret|^test$|^123456$|^secret$|placeholder|example/i.test(_trimmed);

if (process.env.NODE_ENV === 'production' && _isWeak) {
  throw new Error(
    'JWT_SECRET fraco ou padrão detectado em produção. ' +
    'Use um segredo aleatório com pelo menos 32 caracteres. ' +
    'Gere com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"'
  );
} else if (_isWeak) {
  console.warn(
    '[auth] JWT_SECRET fraco/padrão — aceito apenas em desenvolvimento. ' +
    'NÃO use este segredo em produção.'
  );
}
const TOKEN_TTL = process.env.JWT_TTL || '12h';

// ── Hash de senha ──────────────────────────────────────────────────
export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// ── Emissão / verificação de token ─────────────────────────────────
export function assinarToken(payload: TokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: TOKEN_TTL as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, JWT_SECRET as string, options);
}

export function verificarToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as TokenPayload;
  } catch {
    return null;
  }
}

// Extrai o token do header Authorization: Bearer, ou da query (?token=) para mídia (<img>/<video>)
function extrairToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  const q = req.query.token;
  if (typeof q === 'string' && q.length > 0) {
    return q;
  }
  return null;
}

// ── Middlewares ────────────────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extrairToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }
  const payload = verificarToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  req.user = payload;
  next();
}

export function requireRole(...roles: Funcao[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    // ADMIN tem acesso a tudo.
    if (req.user.funcao === 'ADMIN' || roles.includes(req.user.funcao)) {
      return next();
    }
    return res.status(403).json({ error: 'Permissão insuficiente para esta ação.' });
  };
}