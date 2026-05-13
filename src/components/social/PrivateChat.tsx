import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
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

const initial = (name: string) => (name?.trim()?.[0] || "U").toUpperCase();

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
    const { data, error } = await supabase.rpc("get_conversation_messages" as any, { _conversation_id: conversationId });
    if (!error) setMessages((data as Msg[]) || []);
    setLoading(false);
    await supabase.rpc("mark_conversation_read" as any, { _conversation_id: conversationId });
  };

  useEffect(() => { load(); }, [conversationId]);

  useEffect(() => {
    const ch = supabase
      .channel(`conv-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Msg]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

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
    <div className="flex flex-col h-[70vh] border rounded-lg bg-card">
      <div className="flex items-center gap-3 p-3 border-b">
        <Button size="icon" variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <Avatar className="h-9 w-9">
          {friendAvatar && <AvatarImage src={friendAvatar} />}
          <AvatarFallback>{initial(friendName)}</AvatarFallback>
        </Avatar>
        <div className="font-semibold">{friendName}</div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">Sem mensagens ainda. Diz olá!</div>
        ) : messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] px-3 py-2 rounded-2xl text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {m.body}
                <div className={cn("text-[10px] mt-1 opacity-70")}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          );
        })}
      </div>

      {!canSend && (
        <div className="px-4 py-2 text-xs text-center text-muted-foreground border-t">
          {status === "blocked" ? "Conversa bloqueada." : "Já não são amigos. Não podes enviar mensagens."}
        </div>
      )}

      <div className="flex gap-2 p-3 border-t">
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
