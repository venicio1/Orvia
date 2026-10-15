# Testes e validações

## Fundação

- `pnpm typecheck`: contratos TypeScript em web e API.
- `pnpm lint`: regras estáticas em cada app.
- `pnpm test`: testes unitários/API e testes de componentes essenciais da interface.
- `pnpm build`: build de produção de ambos os apps.
- `pnpm check`: sequência completa.
- Verificação manual no navegador: navegação, layout responsivo, teclado/foco, carregamento e estado de API indisponível.

O health check deve retornar resposta JSON real da API; a rota proxy deve converter indisponibilidade em erro HTTP e o frontend deve oferecer nova tentativa. Se não houver datasets, cada seção mostra ausência de dados sem itens fictícios.

## Etapas seguintes

Adicionar testes unitários às regras de domínio, integração com PostgreSQL/fila/adaptadores, end-to-end dos fluxos críticos e testes de autorização entre usuários. Abranger fuso e horário de verão, idempotência de retrospectiva, limites de APIs, respostas inválidas da IA e fontes sem evidência.

Não considerar uma funcionalidade concluída por existir uma página. Registrar comandos, resultados e limitações por entrega.
