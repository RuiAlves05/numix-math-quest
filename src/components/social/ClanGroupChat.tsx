import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Loader2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Msg {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_display_name: string;
  sender_avatar_url: string | null;
}

interface Props {
  clanId: string;
  clanName: string;
  meId: string;
}

const initial = (n: string) => (n?.trim()?.[0] || "U").toUpperCase();

export const ClanGroupChat = ({ clanId, clanName, meId }: Props) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_clan_messages" as any);
    if (!error) setMessages((data as Msg[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clanId]);

  useEffect(() => {
    const ch = supabase
      .channel(`clan-${clanId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clan_messages", filter: `clan_id=eq.${clanId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [clanId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    if (text.length > 1000) { toast({ title: "Mensagem demasiado longa", variant: "destructive" }); return; }
    setSending(true);
    const { error } = await supabase.rpc("send_clan_message" as any, { _body: text });
    setSending(false);
    if (error) { toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" }); return; }
    setBody("");
  };

  const fmtDay = (d: Date) => {
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Hoje";
    if (d.toDateString() === yest.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <div className="flex flex-col h-[70vh] border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/40">
        <Shield className="h-5 w-5 text-primary" />
        <div className="font-semibold">{clanName}</div>
        <span className="text-xs text-muted-foreground">Chat do clã</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">Sem mensagens ainda. Sê o primeiro a falar!</div>
        ) : messages.map((m, i) => {
          const isOwn = m.sender_id === meId;
          const prev = messages[i - 1];
          const showSender = !prev || prev.sender_id !== m.sender_id;
          const d = new Date(m.created_at);
          const prevD = prev ? new Date(prev.created_at) : null;
          const sameDay = prevD && d.toDateString() === prevD.toDateString();
          const dayLabel = !sameDay ? fmtDay(d) : null;
          const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={m.id}>
              {dayLabel && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{dayLabel}</span>
                </div>
              )}
              <div className={`flex gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                {showSender ? (
                  <Avatar className="h-8 w-8 mt-0.5">
                    {m.sender_avatar_url && <AvatarImage src={m.sender_avatar_url} />}
                    <AvatarFallback className="text-xs">{initial(m.sender_display_name)}</AvatarFallback>
                  </Avatar>
                ) : <div className="w-8" />}
                <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                  {showSender && !isOwn && (
                    <span className="text-xs font-medium text-muted-foreground mb-0.5 px-1">{m.sender_display_name}</span>
                  )}
                  <div className={`px-3 py-2 rounded-2xl text-sm break-words ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.body}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 px-1">{time}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 p-3 border-t bg-card">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Escreve uma mensagem ao clã…"
          maxLength={1000}
          disabled={sending}
        />
        <Button onClick={send} disabled={sending || !body.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
