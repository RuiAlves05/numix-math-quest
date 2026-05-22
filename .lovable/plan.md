# Plano de implementação — Numix v2

Scope grande mas bem definido. Vou implementá-lo em 6 fases, cada uma com a sua migration e ficheiros de frontend. Nada existente é apagado: pontos, ranking, streaks, amizades, RLS e RPCs atuais permanecem.

---

## Fase 1 — Correio (notifications) com soft-delete

**DB (migration):**
- `notifications`: adicionar `deleted_at timestamptz`.
- Policy de DELETE não é necessária — usamos soft-delete via RPC.
- RPCs novas (SECURITY DEFINER, valida `auth.uid()`):
  - `mark_all_notifications_read()`
  - `delete_notification(_id uuid)`
  - `delete_all_notifications()`
- Atualizar `get_mailbox()`:
  - filtrar `deleted_at IS NULL`
  - filtrar `type NOT IN ('friend_request')` (pedidos vivem na tab Pedidos)
  - notificações de bloqueio passam a ser informativas (sem `action_id` ativo no correio)

**Frontend:** novo `src/components/social/Mailbox.tsx` com botões "Marcar todas como lidas", "Eliminar todas" (com confirm) e ✕ por linha. Sem ações de undo de bloqueio.

---

## Fase 2 — Pedidos e Bloqueados separados

**DB:**
- Nova RPC `list_friend_requests()` devolvendo `received` e `sent` (com perfis).
- Nova RPC `cancel_friend_request(_id uuid)` para o sender cancelar.
- `unblock_user` já existe — mantida. Removida a ideia de expiração de 24h para blocks (já não há expiração no fluxo; a tabela `friendship_actions` continua só para `remove_friend`).

**Frontend:**
- `src/components/social/FriendRequests.tsx` (Recebidos / Enviados, aceitar/recusar/cancelar).
- `src/components/social/BlockedUsers.tsx` (lista + Desbloquear, sem limite de tempo).
- `Social.tsx` reorganizado: tabs Amigos · Pedidos · Correio · Procurar · Bloqueados.

---

## Fase 3 — Chat imersivo

**Frontend apenas** (sem mudanças no schema de `messages`; o `sender_id` já está disponível e os perfis acedem-se via `profiles`):
- Nova RPC `get_conversation_messages_with_profiles(_conversation_id)` devolvendo `sender_display_name` e `sender_avatar_url` (para evitar N+1).
- `src/components/social/ChatHeader.tsx`: avatar + nome + estado + back.
- `src/components/social/MessageBubble.tsx`: bolha com `isOwnMessage`, `showSenderInfo`, agrupamento por remetente, hora discreta.
- `PrivateChat.tsx` refatorado para usar os dois componentes acima.

---

## Fase 4 — Memória do Tutor

**DB:**
- Tabela `tutor_error_memory` com `unique(user_id, error_type, level, topic)`.
- RLS: SELECT/UPDATE só do próprio (nenhum INSERT direto — feito por RPC).
- RPCs:
  - `get_tutor_error_memory()` — só ativas
  - `clear_tutor_error(_id)`
  - `clear_tutor_error_by_type(_type, _level, _topic)`
  - `clear_all_tutor_memory()`
  - `upsert_tutor_error_memory(_error_type, _level, _topic)` — chamada internamente pelo `submit_answer`
- `submit_answer` atualizado: quando errado, deriva `error_type` a partir do `topic`/`category` da questão e chama `upsert_tutor_error_memory`.

**Frontend:**
- `src/components/tutor/TutorMemorySettings.tsx` — lista + apagar individual + apagar tudo (com confirms).
- Acesso no `Dashboard.tsx` (card "Memória do Tutor" com botão "Gerir memória" abrindo um Sheet).
- `ErrorAnalysis.tsx` e `math-tutor` edge function leem `get_tutor_error_memory()` em vez de re-agregar wrongs antigos. Fallback: se vazio, continuam a comportar-se como hoje (sem dicas personalizadas).

---

## Fase 5 — Banco de 350 perguntas + quiz aleatório

**DB:**
- `questions`: adicionar `school_year int`, `topic text`, `difficulty text`, `is_active bool default true`. Manter `options[]` + `correct_answer` existentes (não vou partir a estrutura atual). Backfill `school_year = difficulty_level` para as existentes.
- **Inserts** de 350 perguntas (50 Madeira, 100 Bronze, 100 Prata, 100 Ouro) com `topic`, `difficulty`, `explanation`, `points`. Vou gerar via script em Python e incluir como SQL na migration.
- RPC `get_random_quiz_questions(_level int)`:
  - devolve `id, level, school_year, question_text, options, points, difficulty, topic` — **sem** `correct_answer`
  - limites: 5 (lvl 1), 10 (lvl 2-4)
  - `is_active = true` AND `difficulty_level = _level` AND `ORDER BY random()`
- RPC `submit_answer` já valida no servidor; vou alargar o JSON de retorno para incluir `explanation`.
- **Restringir** SELECT direto em `questions` a colunas seguras: criar policy que continua a permitir SELECT (compatibilidade), mas o quiz passa a usar a RPC. (Não removo a policy existente para não partir nada; documentação no código.)

**Frontend:**
- `Quiz.tsx`: usa `get_random_quiz_questions`, fluxo igual ao atual (submit_answer já existe). Resumo final inclui tópicos errados e dica do tutor.

**Sessões de quiz (Feature 9):** **adiada** — marco como opcional. O enunciado diz "se for viável sem quebrar o projeto". A validação server-side via `submit_answer` + ocultação de `correct_answer` na RPC já cobre os critérios de aceitação 38-40. Faço nota no final para implementarmos depois se quiseres.

---

## Fase 6 — Tipos e verificação

- Atualizar `src/integrations/supabase/types.ts` com novas tabelas/RPCs/colunas.
- Correr linter de Supabase e corrigir issues introduzidos.
- Verificar build TypeScript.

---

## Detalhes técnicos

```text
notifications (mailbox)  ──filter type!=friend_request, deleted_at IS NULL──┐
friend_requests ────── list_friend_requests() ──── FriendRequests.tsx       │
user_blocks  ─────────  get_blocked_users() ────── BlockedUsers.tsx         │── Social.tsx tabs
friendships ──────────  get_friends() ──────────── FriendsList               │
messages ─────────────  get_..._with_profiles() ── PrivateChat ── MessageBubble
tutor_error_memory ───  get_tutor_error_memory() ─ TutorMemorySettings
questions (+is_active) ── get_random_quiz_questions() ── Quiz.tsx
                       └─ submit_answer() (server-validated, with explanation)
```

**Mapeamento error_type ← topic**: dicionário no SQL do `submit_answer` (counting, addition, subtraction, multiplication, division, fractions, geometry, measurement, word_problem, time, money, patterns). Fallback: `error_type = topic` se não houver match.

**Migrations:** 3 separadas para reduzir risco —
1. notifications + RPCs correio + tutor_error_memory + RPCs tutor + alter submit_answer
2. questions alter + 350 inserts + get_random_quiz_questions
3. list_friend_requests + cancel_friend_request + get_conversation_messages_with_profiles

**Volume de código:** ~14 ficheiros novos, ~6 editados, ~350 linhas SQL de seed. Vou avançar fase a fase para reduzir erros.

Pronto para começar pela Fase 1.
