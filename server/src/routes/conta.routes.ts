import { Router } from 'express';
import multer from 'multer';
import { drive, uploadToDrive } from '../lib/drive.js';

// Sessão do usuário logado + proxy autenticado de mídia do Drive.
export const contaRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/me — dados do usuário logado
contaRouter.get('/api/me', (req, res) => {
  res.json(req.user);
});

// GET /api/files/:id — proxy autenticado para mídia do Drive (mantém o arquivo privado)
contaRouter.get('/api/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const meta = await drive.files.get({ fileId: id, fields: 'mimeType, name' });
    const driveRes = await drive.files.get(
      { fileId: id, alt: 'media' },
      { responseType: 'stream' }
    );
    if (meta.data.mimeType) res.setHeader('Content-Type', meta.data.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    (driveRes.data as any).pipe(res);
  } catch (error: any) {
    console.error('Error proxying Drive file:', error);
    res.status(404).json({ error: 'Arquivo não encontrado.' });
  }
});

// POST /api/upload — retorna a URL do proxy autenticado
contaRouter.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const timestamp = Date.now();
    const ext = req.file.originalname.split('.').pop() || 'bin';
    const filename = `cme-${timestamp}.${ext}`;

    const fileId = await uploadToDrive(req.file.buffer, filename, req.file.mimetype);
    res.json({ url: `/api/files/${fileId}` });
  } catch (error: any) {
    console.error('Error during Google Drive upload:', error);
    res.status(500).json({ error: error.message || 'Error uploading file' });
  }
});
