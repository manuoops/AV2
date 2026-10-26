import { Validador } from "./Validador";

const DIAS_MAXIMOS_RETROATIVOS = 90;

export class ValidadorDataEntrada extends Validador<Date> {
  public validar(data: Date): boolean {
    const agora = new Date();

    if (data.getTime() > agora.getTime()) {
      this.mensagemErro = "Data de entrada não pode ser futura.";
      return false;
    }

    const limiteRetroativo = new Date(
      agora.getTime() - DIAS_MAXIMOS_RETROATIVOS * 24 * 60 * 60 * 1000
    );

    if (data.getTime() < limiteRetroativo.getTime()) {
      this.mensagemErro = `Data de entrada não pode ser anterior a ${DIAS_MAXIMOS_RETROATIVOS} dias atrás.`;
      return false;
    }

    this.mensagemErro = "";
    return true;
  }
}