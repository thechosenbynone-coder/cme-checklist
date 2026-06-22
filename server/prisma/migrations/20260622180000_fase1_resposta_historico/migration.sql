-- AlterTable
ALTER TABLE "RespostaItem" ADD COLUMN     "updatedById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "RespostaHistorico" (
    "id" TEXT NOT NULL,
    "inspecaoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "secao" TEXT,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "responsavelDeclarado" TEXT,
    "userId" TEXT,
    "userNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespostaHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RespostaHistorico_inspecaoId_idx" ON "RespostaHistorico"("inspecaoId");

-- CreateIndex
CREATE INDEX "RespostaHistorico_inspecaoId_itemId_idx" ON "RespostaHistorico"("inspecaoId", "itemId");

-- CreateIndex
CREATE INDEX "RespostaHistorico_criadoEm_idx" ON "RespostaHistorico"("criadoEm");

-- AddForeignKey
ALTER TABLE "RespostaItem" ADD CONSTRAINT "RespostaItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
