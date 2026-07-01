import { Router } from 'express';
import multer from 'multer';
import { classifyDriveError, downloadFromDrive, uploadToDrive, type DriveErrorCode } from '../lib/drive.js';

// Sessão do usuário logado + proxy autenticado de mídia do Drive.
export const contaRouter = Router();

// Tipos que o app mobile realmente produz: fotos via <input accept="image/*">
// (câmera/galeria) e vídeo sempre em video/webm (MediaRecorder hardcoded).
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/webm']);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — cobre foto + vídeo de até 60s em webm com folga

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Tipo de arquivo não permitido.'));
      return;
    }
    cb(null, true);
  },
});

// HTTP status por código de erro do Drive — a maioria não deve ser repetida
// automaticamente pelo cliente (configuração/permissão não se resolve sozinha).
const DRIVE_ERROR_STATUS: Record<DriveErrorCode, number> = {
  NOT_CONFIGURED: 503,
  AUTH_EXPIRED: 503,
  QUOTA_OU_PERMISSAO: 503,
  UNKNOWN: 502,
};

// GET /api/me — dados do usuário logado
contaRouter.get('/api/me', (req, res) => {
  res.json(req.user);
});

// GET /api/files/:id — proxy autenticado para mídia do Drive (mantém o arquivo privado)
contaRouter.get('/api/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { stream, mimeType } = await downloadFromDrive(id);
    if (mimeType) res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    (stream as any).pipe(res);
  } catch (error: any) {
    const classified = classifyDriveError(error);
    res.status(DRIVE_ERROR_STATUS[classified.code]).json({ error: classified.message, code: classified.code });
  }
});

// POST /api/upload — retorna a URL do proxy autenticado
contaRouter.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Arquivo muito grande. O limite é de 25MB.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(415).json({ error: 'Tipo de arquivo não permitido.' });
      }
      return res.status(400).json({ error: 'Falha ao processar o arquivo enviado.' });
    }
    if (err) return res.status(400).json({ error: 'Falha ao processar o arquivo enviado.' });

    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

      const timestamp = Date.now();
      const ext = req.file.originalname.split('.').pop() || 'bin';
      const filename = `cme-${timestamp}.${ext}`;

      const fileId = await uploadToDrive(req.file.buffer, filename, req.file.mimetype);
      res.json({ url: `/api/files/${fileId}` });
    } catch (error: any) {
      const classified = classifyDriveError(error);
      res.status(DRIVE_ERROR_STATUS[classified.code]).json({ error: classified.message, code: classified.code });
    }
  });
});
