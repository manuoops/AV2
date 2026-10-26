import { Prisma } from "@prisma/client";
import { prisma } from "./PrismaClient";

export function executarTransacao<T>(
  operacao: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(operacao);
}
