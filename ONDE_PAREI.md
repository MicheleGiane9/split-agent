# Onde paramos — Split Agent

## Status atual ✅
- Projeto completo e funcionando em modo **PHRS nativo** (PAYMENT_MODE=native).
- Testes offline OK: split-calculator e parser de linguagem natural.
- Deploy on-chain FUNCIONOU na Pharos Atlantic.

## Dados importantes
- RPC correto: `https://atlantic.dplabs-internal.com` (chain 688689)
- Contrato de escrow implantado: `0x51d45286653Ca652BE5087B5f127304bc9b93A2A`
  - Já está no .env como ESCROW_ADDRESS.
- Pagadores configurados no PARTICIPANT_KEYS: Ana e Pedro (carteiras com 20 PHRS).
- Carteira do agente: ~50 PHRS.

## PRÓXIMO PASSO (era pra rodar agora)
Rodar o agente de ponta a ponta:

```
node agent.js "João, Ana e Pedro foram ao bar, João pagou 6, Ana não pagou nada, Pedro não pagou nada"
```

Esperado: total 6, 2 por pessoa. Ana paga 2, Pedro paga 2, João recebe 4.
Deve terminar com "✅ Divisão liquidada com sucesso!".

## Depois disso (opcional)
- Testar o modo AUTÔNOMO (2 terminais):
  - Terminal A: `npm run watch`  (fica escutando o contrato)
  - Terminal B: `node agent.js --no-settle "João, Ana e Pedro foram ao bar, João pagou 6, Ana não pagou nada, Pedro não pagou nada"`
  - O Terminal A liquida sozinho ao detectar que todos pagaram.
- Gravar o vídeo seguindo o DEMO_SCRIPT.md.
- Submeter no DoraHacks (passo a passo no README.md).

## Observação técnica
- O Edit estava truncando arquivos grandes nesse projeto; se algum arquivo parecer
  cortado no VSCode, feche e reabra para ver a versão real do disco. Todos os JS
  passaram no `node --check`.
