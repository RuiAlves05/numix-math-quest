import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ChatHeader } from "./ChatHeader";
import { MessageBubble } from "./MessageBubble";

interface Msg {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender_display_name: string;
  sender_avatar_url: string | null;
}

interface Props {
  conversationId: string;
  friendId: string;
  friendName: string;
  friendAvatar: string | null;
  status: string;
  meId: string;
  onBack: () => void;
}

export const PrivateChat = ({ conversationId, friendId, friendName, friendAvatar, status, meId, onBack }: Props) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const canSend = status === "active";

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_conversation_messages_with_profiles" as any, { _conversation_id: conversationId });
    if (!error) setMessages((data as Msg[]) || []);
    setLoading(false);
    await supabase.rpc("mark_conversation_read" as any, { _conversation_id: conversationId });
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conversationId]);

  useEffect(() => {
    const ch = supabase
      .channel(`conv-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => {
        // Re-fetch to get joined sender profile info reliably
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    if (text.length > 1000) { toast({ title: "Mensagem demasiado longa", variant: "destructive" }); return; }
    setSending(true);
    const { error } = await supabase.rpc("send_message" as any, { _conversation_id: conversationId, _body: text });
    setSending(false);
    if (error) { toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" }); return; }
    setBody("");
  };

  return (
    <div className="flex flex-col h-[70vh] border rounded-lg bg-card overflow-hidden">
      <ChatHeader name={friendName} avatarUrl={friendAvatar} status={status} onBack={onBack} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">Sem mensagens ainda. Diz olá!</div>
        ) : messages.map((m, i) => {
          const isOwn = m.sender_id === meId;
          const prev = messages[i - 1];
          const showSenderInfo = !prev || prev.sender_id !== m.sender_id;
          const d = new Date(m.created_at);
          const prevD = prev ? new Date(prev.created_at) : null;
          const sameDay = prevD && d.toDateString() === prevD.toDateString();
          let dayLabel: string | null = null;
          if (!sameDay) {
            const today = new Date();
            const yest = new Date(); yest.setDate(today.getDate() - 1);
            if (d.toDateString() === today.toDateString()) dayLabel = "Hoje";
            else if (d.toDateString() === yest.toDateString()) dayLabel = "Ontem";
            else dayLabel = d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
          }
          return (
            <div key={m.id}>
              {dayLabel && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{dayLabel}</span>
                </div>
              )}
              <MessageBubble
                body={m.body}
                createdAt={m.created_at}
                isOwn={isOwn}
                showSenderInfo={showSenderInfo}
                senderName={m.sender_display_name}
                senderAvatar={m.sender_avatar_url}
              />
            </div>
          );
        })}
      </div>

      {!canSend && (
        <div className="px-4 py-2 text-xs text-center text-muted-foreground border-t">
          {status === "blocked" ? "Conversa bloqueada." : "Já não são amigos. Não podes enviar mensagens."}
        </div>
      )}

      <div className="flex gap-2 p-3 border-t bg-card">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={canSend ? "Escreve uma mensagem…" : "Indisponível"}
          maxLength={1000}
          disabled={!canSend || sending}
        />
        <Button onClick={send} disabled={!canSend || sending || !body.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
