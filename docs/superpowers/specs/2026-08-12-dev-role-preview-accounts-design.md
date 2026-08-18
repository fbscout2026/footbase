# FOOTBASE — Contas `.dev` para comparar Agente e Clube

Data: 12 de agosto de 2026  
Status: implementado e validado no Supabase e no login local

## 1. Objetivo

Permitir que o proprietário visualize e compare a experiência real de uma conta de agente e de uma conta de clube pelo login normal do FOOTBASE, usando o Supabase e as mesmas regras de autorização da aplicação.

## 2. Abordagem aprovada

Criar duas contas reais de demonstração no projeto Supabase ativo:

- `agente.teste@footbase.dev`, com perfil `agent`, conta aprovada e agente verificado;
- `clube.teste@footbase.dev`, com perfil `club` e conta aprovada.

As contas usarão uma senha comum de teste, informada ao usuário fora do repositório. A senha não será gravada em componentes, arquivos Markdown, variáveis `NEXT_PUBLIC_*`, logs ou commits.

O `/login` continuará visualmente e funcionalmente igual. Não haverá bypass, simulação de sessão, troca arbitrária de papel ou comportamento exclusivo capaz de chegar à produção.

## 3. Experiência esperada

### Agente

- login normal e acesso às rotas aprovadas;
- item de navegação e acesso a `/agente`;
- painel do agente carregado pelo Supabase;
- elegibilidade para reivindicar atleta disponível;
- visualização somente leitura dos clubes;
- perfil mínimo identificável como demonstração FOOTBASE.

### Clube

- login normal e acesso às rotas aprovadas;
- ausência do item `/agente` e redirecionamento defensivo se a URL for digitada;
- diretório e perfil de clubes carregados pelo Supabase;
- elegibilidade para reivindicar clube disponível;
- visualização de atletas sem permissão de reivindicação;
- perfil mínimo identificável como demonstração FOOTBASE.

## 4. Dados e isolamento

- todos os usuários e perfis de demonstração usam e-mail `@footbase.dev` e nomes iniciados por `FOOTBASE Teste`;
- não será atribuído atleta ou clube real sem necessidade para a comparação;
- a criação será idempotente: repetir o procedimento não duplica usuários, perfis ou agentes;
- os dados existentes de atletas, clubes, reivindicações e scraping não serão modificados;
- será executada verificação explícita de papel, aprovação e status de verificação após a criação.

## 5. Segurança

- criação via mecanismo administrativo autenticado do Supabase;
- signup público continua limitado a `agent|club` e estado `pending`;
- nenhuma política RLS, trigger ou função será enfraquecida;
- credenciais administrativas e senha de teste não entram no cliente nem na documentação;
- as contas `.dev` continuam sujeitas às mesmas RLS e guards das contas reais;
- a futura remoção deverá mirar apenas os UUIDs/e-mails exatos dessas duas contas, com checagem prévia das referências.

## 6. Validação

1. Confirmar os dois usuários em `auth.users`.
2. Confirmar `profiles.role` e `account_status = approved`.
3. Confirmar `agentes.verified_status = verified` apenas para a conta agente.
4. Entrar pelo `/login` com cada conta.
5. Validar navegação, `/agente`, `/clubes`, dossiê de atleta e estados de reivindicação conforme o papel.
6. Executar TypeScript/build somente se algum código precisar ser alterado; a abordagem preferida não exige mudança da aplicação.
7. Atualizar `PROJECT_STATE.MD`, `CLAUDE.MD` e `PLANO_EXECUCAO_V3.md` com a existência, finalidade e remoção segura das contas, sem registrar a senha.

## 7. Critérios de aceite

- ambos os logins funcionam pela tela existente;
- agente e clube recebem papéis diferentes e corretos;
- agente acessa `/agente`; clube não acessa;
- ações de reivindicação respeitam o papel real;
- nenhuma senha ou chave é incluída no repositório;
- nenhum dado institucional ou de scraping é sobrescrito;
- as contas ficam claramente identificadas como demonstração `.dev`.
