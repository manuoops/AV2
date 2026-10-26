-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "criadoPorId" UUID;

-- CreateIndex
CREATE INDEX "usuarios_criadoPorId_idx" ON "usuarios"("criadoPorId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
