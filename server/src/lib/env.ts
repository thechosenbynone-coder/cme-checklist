// Carrega variáveis de ambiente. Importado ANTES de qualquer módulo que leia
// process.env no nível de módulo (ex.: lib/drive.ts).
import dotenv from 'dotenv';

dotenv.config();

// Integração com Google Drive é opcional para o servidor subir (upload/leitura
// de evidências falha de forma tratada em runtime — ver lib/drive.ts), mas
// avisamos alto no boot se a configuração estiver incompleta. NUNCA travar o
// boot por causa disso: acoplar disponibilidade do processo a uma integração
// externa foi a causa do incidente de login 500 (ver CLAUDE.md).
const GOOGLE_ENV_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID'];
const missingGoogleVars = GOOGLE_ENV_VARS.filter((name) => !process.env[name]);
if (missingGoogleVars.length > 0) {
  console.error(
    `[INTEGRATION][DRIVE] Configuração incompleta. Variáveis ausentes: ${missingGoogleVars.join(', ')}. Upload e leitura de evidências estarão indisponíveis.`
  );
}
