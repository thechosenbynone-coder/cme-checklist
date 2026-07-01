-- CreateTable: contador sequencial de inspeções por equipamento (numeração rastreável).
-- Aditiva, tabela vazia — a sequência começa do zero por equipamento (decisão de implantação).
CREATE TABLE "InspecaoSequencia" (
    "equipamentoId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InspecaoSequencia_pkey" PRIMARY KEY ("equipamentoId")
);

-- AddForeignKey
ALTER TABLE "InspecaoSequencia" ADD CONSTRAINT "InspecaoSequencia_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
