import { PrismaClient } from "@prisma/client";
import { ambiente } from "../config/Ambiente";

const globalComPrisma = globalThis as typeof globalThis & {
  prismaGreencode?: PrismaClient;
};

export const prisma = globalComPrisma.prismaGreencode ?? new PrismaClient({
  datasources: {
    db: {
      url: ambiente.databaseUrl
    }
  }
});

if (process.env.NODE_ENV !== "production") {
  globalComPrisma.prismaGreencode = prisma;
}
