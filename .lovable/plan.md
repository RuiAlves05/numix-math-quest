## Sistema Social Completo para Numix

Implementação faseada de um sistema social com amigos, chat, correio interno, bloqueios e integração com ranking. Toda a lógica crítica fica no Supabase via RPCs `SECURITY DEFINER` com RLS estrito.

### Fase 1 — Base de dados (migration única)

**Tabelas novas** (todas com RLS ativo):

- `friend_requests` — sender_id, receiver_id, status (pending/accepted/declined/cancelled/expired), expires_at (now + 7 dias)
- `friendships` — duas linhas por amizade (user_id, friend_id), unique(user_id, friend_id)
- `user_blocks` — blocker_id, blocked_id, unique
- `friendship_actions` — action_type (remove_friend/block_user), actor_id, target_id, previous_state jsonb, expires_at (now + 24h), undone_at, can_undo
- `notifications` — user_id, type, title, message, data jsonb, read_at, expires_at, action_used_at
- `conversations` — user_one_id, user_two_id (sempre ordenados), status (active/removed/blocked/deleted), deleted_for_*_at, blocked_at
- `messages` — conversation_id, sender_id, body (≤1000 chars), read_at, deleted_at

**Índices**: conforme spec (sender/receiver, user_id, blocker_id, conversation_id+created_at, etc.)

**RLS**: leitura própria nas tabelas; escrita crítica apenas via RPC. Notificações e mensagens só visíveis ao dono/participantes.

### Fase 2 — RPCs Supabase (SECURITY DEFINER)

`send_friend_request`, `respond_friend_request`, `remove_friend`, `undo_remove_friend`, `block_user`, `undo_block_user`, `get_friends`, `search_users`, `get_mailbox`, `mark_notification_read`, `get_or_create_conversation`, `send_message`, `get_conversation_messages`.

Cada RPC valida `auth.uid()`, regras de bloqueio, amizade existente, duplicados e regra especial bloqueador→bloqueado para reconciliação.

### Fase 3 — Atualizar `get_leaderboard`

Modificar para excluir utilizadores onde existe bloqueio em qualquer direção entre `auth.uid()` e o candidato. Aplica-se aos 4 níveis.

### Fase 4 — Frontend

**Nova rota** `/social` em `App.tsx`.

**Novos ficheiros**:
- `src/pages/Social.tsx` — layout com tabs (Amigos, Pedidos, Correio, Pesquisar, Chat, Bloqueados), responsivo
- `src/components/social/UserSearch.tsx`
- `src/components/social/FriendsList.tsx`
- `src/components/social/FriendRequests.tsx`
- `src/components/social/Mailbox.tsx`
- `src/components/social/ChatList.tsx`
- `src/components/social/PrivateChat.tsx`
- `src/components/social/BlockedUsers.tsx`
- `src/components/social/UserProfileCard.tsx`
- `src/components/social/ConfirmDialog.tsx`

**Integração no menu**: adicionar link Social no Dashboard com badge de notificações não lidas.

**Realtime (1ª fase mínima)**: subscrição a `notifications` e `messages` da conversa aberta para refresh ao vivo. Restantes refresh manual.

### Fase 5 — UX

Empty states, toasts, confirmações, avatares circulares com fallback de inicial, badges de contadores nas tabs.

### Detalhes técnicos

- Conversas guardam `(user_one_id, user_two_id)` ordenados por uuid asc para evitar duplicados, com unique parcial.
- `previous_state` em `friendship_actions` guarda snapshot necessário para undo (ex: amizade existia? havia conversa?).
- Reverter remoção/bloqueio dentro de 24h restaura amizade dos dois lados; após bloqueio, conversa antiga não é restaurada se foi marcada deleted.
- Pesquisa filtra próprio utilizador e bloqueios bidirecionais.
- `search_users` devolve `relation_state` calculado para o frontend usar no botão.
- Validação de body: trim, ≥1 char, ≤1000 chars.
- Tipos TypeScript regenerados automaticamente após migration.

### Riscos & mitigações

- **Tamanho**: feature muito grande — entrego tudo num único ciclo (migration + frontend) para evitar estados parciais.
- **Compatibilidade ranking**: a nova `get_leaderboard` mantém assinatura idêntica `(_level, _limit)`, só adiciona filtro interno; `Leaderboard.tsx` não muda.
- **Não quebrar existente**: nenhuma alteração a `submit_answer`, `profiles`, `user_level_stats`, Quiz, Dashboard, Auth, ProfileSettings.

Após aprovação avanço com a migration (vai pedir confirmação separada por ser SQL) e depois o código frontend.
