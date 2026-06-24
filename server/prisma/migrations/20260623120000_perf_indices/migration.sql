-- CreateIndex
CREATE INDEX "ItemChecklist_modeloId_idx" ON "ItemChecklist"("modeloId");

-- CreateIndex
CREATE INDEX "Inspecao_createdById_status_idx" ON "Inspecao"("createdById", "status");

-- CreateIndex
CREATE INDEX "MaterialUtilizado_inspecaoId_idx" ON "MaterialUtilizado"("inspecaoId");

-- CreateIndex
CREATE INDEX "MaterialUtilizado_materialId_idx" ON "MaterialUtilizado"("materialId");
