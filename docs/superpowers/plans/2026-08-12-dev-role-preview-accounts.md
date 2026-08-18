# Plano — contas `.dev` de Agente e Clube

Status: concluído em 12 de agosto de 2026.

1. Verificar o mecanismo atual de criação de usuário e os campos mínimos de `profiles`/`agentes`.
2. Criar ou atualizar idempotentemente `agente.teste@footbase.dev` e `clube.teste@footbase.dev` pela Admin API server-side.
3. Confirmar e aprovar os dois perfis; marcar somente o agente como verificado.
4. Testar `signInWithPassword` para ambas as contas e conferir os papéis retornados pelo banco.
5. Validar as diferenças de rota e interface pelo navegador local.
6. Confirmar que atletas, clubes, reivindicações e dados de scraping não foram alterados.
7. Atualizar os três arquivos de continuidade sem registrar a senha.
