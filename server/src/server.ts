// Entry point: sobe o servidor HTTP. A configuração do Express vive em app.ts
// (exportado para os testes de endpoint).
import { app } from './app.js';

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`Server CME Checklist rodando na porta ${PORT}`);
});
