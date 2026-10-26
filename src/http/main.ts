import { iniciarServidor } from "./Servidor";
import { prisma } from "../infra/PrismaClient";

async function main(): Promise<void> {
  const servidor = await iniciarServidor();
  let encerrando = false;

  const encerrar = async (sinal: NodeJS.Signals) => {
    if (encerrando) return;
    encerrando = true;
    servidor.log.info(`Sinal ${sinal} recebido; encerrando servidor.`);
    try {
      await servidor.close();
      await prisma.$disconnect();
      process.exitCode = 0;
    } catch (erro) {
      servidor.log.error(erro, "Falha durante o encerramento.");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", encerrar);
  process.once("SIGTERM", encerrar);
}

main().catch(async (erro) => {
  console.error("Erro fatal ao iniciar GreenCode API:", erro);
  await prisma.$disconnect();
  process.exitCode = 1;
});
