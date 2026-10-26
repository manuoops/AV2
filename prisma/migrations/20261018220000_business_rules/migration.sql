-- Business constraints omitted from Prisma schema because Prisma does not model CHECK constraints.
ALTER TABLE "organizacoes"
  ADD CONSTRAINT "organizacoes_cnpj_14_digitos_check" CHECK ("cnpj" ~ '^[0-9]{14}$');

ALTER TABLE "contratos"
  ADD CONSTRAINT "contratos_valor_mensal_positivo_check" CHECK ("valorMensal" > 0),
  ADD CONSTRAINT "contratos_vencimento_apos_assinatura_check" CHECK ("dataVencimento" > "dataAssinatura");

ALTER TABLE "equipamentos"
  ADD CONSTRAINT "equipamentos_peso_positivo_check" CHECK ("pesoQuilogramas" > 0),
  ADD CONSTRAINT "equipamentos_posicao_positiva_check" CHECK ("posicaoNoLote" >= 1),
  ADD CONSTRAINT "equipamentos_ano_minimo_check" CHECK ("anoFabricacao" >= 1980);

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_versao_check" CHECK ("versao" >= 1);
ALTER TABLE "organizacoes" ADD CONSTRAINT "organizacoes_versao_check" CHECK ("versao" >= 1);
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_versao_check" CHECK ("versao" >= 1);
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_versao_check" CHECK ("versao" >= 1);
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_versao_check" CHECK ("versao" >= 1);

CREATE FUNCTION "fn_equipamento_desmonte_exige_triagem"() RETURNS trigger AS $$
BEGIN
  IF OLD."statusRastreamento" = 'AGUARDANDO_TRIAGEM'
     AND NEW."statusRastreamento" IN ('AGUARDANDO_DESMONTE', 'EM_DESMONTE') THEN
    RAISE EXCEPTION 'Equipamento so pode ir para desmonte depois de passar por triagem.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_equipamento_desmonte_exige_triagem"
  BEFORE UPDATE OF "statusRastreamento" ON "equipamentos"
  FOR EACH ROW EXECUTE FUNCTION "fn_equipamento_desmonte_exige_triagem"();

CREATE FUNCTION "fn_lote_triagem_concluida_exige_equipamentos_triados"() RETURNS trigger AS $$
BEGIN
  IF NEW."statusProcessamento" = 'TRIAGEM_CONCLUIDA'
     AND OLD."statusProcessamento" IS DISTINCT FROM 'TRIAGEM_CONCLUIDA'
     AND EXISTS (
       SELECT 1 FROM "equipamentos" e
       WHERE e."loteId" = NEW."id"
         AND e."statusRastreamento" IN ('AGUARDANDO_TRIAGEM', 'EM_TRIAGEM')
     ) THEN
    RAISE EXCEPTION 'Ainda ha equipamentos aguardando triagem individual neste lote.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_lote_triagem_concluida_exige_equipamentos_triados"
  BEFORE UPDATE OF "statusProcessamento" ON "lotes"
  FOR EACH ROW EXECUTE FUNCTION "fn_lote_triagem_concluida_exige_equipamentos_triados"();

CREATE FUNCTION "fn_movimentacao_imutavel"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Movimentacoes sao imutaveis: nao podem ser alteradas nem apagadas.'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_movimentacao_imutavel"
  BEFORE UPDATE OR DELETE ON "movimentacoes"
  FOR EACH ROW EXECUTE FUNCTION "fn_movimentacao_imutavel"();
