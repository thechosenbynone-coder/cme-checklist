-- AlterTable: User — cpf como identificador de campo, email agora opcional
ALTER TABLE "User" ADD COLUMN "cpf" TEXT;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");

-- AlterTable: Inspecao — vídeo geral do equipamento (separado de fotosUrls)
ALTER TABLE "Inspecao" ADD COLUMN "videoUrl" TEXT;

-- AlterTable: RespostaItem — vídeo de evidência por item (separado de fotosUrls)
ALTER TABLE "RespostaItem" ADD COLUMN "videoUrl" TEXT;
