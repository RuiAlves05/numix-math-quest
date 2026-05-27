import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Search, MessageCircle, UserMinus, Ban, UserPlus, Check, X, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/social/ConfirmDialog";
import { PrivateChat } from "@/components/social/PrivateChat";
import { Mailbox, type Notif } from "@/components/social/Mailbox";
import { FriendRequests, type FriendReq } from "@/components/social/FriendRequests";
import { BlockedUsers, type Blocked } from "@/components/social/BlockedUsers";
import { ClanGroupChat } from "@/components/social/ClanGroupChat";

const initial = (name: string) => (name?.trim()?.[0] || "U").toUpperCase();

interface SearchResult {
  user_id: string; display_name: string; avatar_url: string | null;
  total_points: number; relation_state: string; request_id: string | null;
}
interface Friend {
  user_id: string; display_name: string; avatar_url: string | null;
  total_points: number; best_streak: number;
}
interface Conv {
  conversation_id: string; friend_id: string; friend_name: string; avatar_url: string | null;
  status: string; last_message: string | null; last_message_at: string | null; unread_count: number;
}

const Social = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [meId, setMeId] = useState<string>("");
  const [tab, setTab] = useState("friends");
  const [myClanId, setMyClanId] = useState<string | null>(null);
  const [clanName, setClanName] = useState<string>("");

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [openChat, setOpenChat] = useState<Conv | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "remove" | "block" | "unblock"; user: { id: string; name: string } }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setMeId(session.user.id);
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam) setTab(tabParam);
    })();
  }, [navigate]);

  const loadAll = useCallback(async () => {
    const [f, r, m, c, b] = await Promise.all([
      supabase.rpc("get_friends" as any),
      supabase.rpc("list_friend_requests" as any),
      supabase.rpc("get_mailbox" as any),
      supabase.rpc("list_conversations" as any),
      supabase.rpc("get_blocked_users" as any),
    ]);
    setFriends((f.data as Friend[]) || []);
    setRequests((r.data as FriendReq[]) || []);
    setNotifs((m.data as Notif[]) || []);
    setConvs((c.data as Conv[]) || []);
    setBlocked((b.data as Blocked[]) || []);
  }, []);

  useEffect(() => { if (meId) loadAll(); }, [meId, loadAll]);

  useEffect(() => {
    if (!meId) return;
    const ch = supabase
      .channel(`social-${meId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${meId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: `sender_id=eq.${meId}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [meId, loadAll]);

  const doSearch = async () => {
    const term = searchTerm.trim();
    if (!term) { setSearchResults([]); return; }
    setSearching(true);
    const { data, error } = await supabase.rpc("search_users" as any, { _term: term });
    setSearching(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setSearchResults((data as SearchResult[]) || []);
  };

  const sendRequest = async (userId: string) => {
    const { error } = await supabase.rpc("send_friend_request" as any, { _target: userId });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pedido enviado" });
    doSearch(); loadAll();
  };

  const respond = async (requestId: string, action: "accept" | "decline") => {
    const { error } = await supabase.rpc("respond_friend_request" as any, { _request_id: requestId, _action: action });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: action === "accept" ? "Pedido aceite" : "Pedido recusado" });
    doSearch(); loadAll();
  };

  const openConversation = async (friendId: string) => {
    const { data, error } = await supabase.rpc("get_or_create_conversation" as any, { _friend: friendId });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    const friend = friends.find((x) => x.user_id === friendId);
    setOpenChat({
      conversation_id: (data as any).id, friend_id: friendId,
      friend_name: friend?.display_name || "Amigo", avatar_url: friend?.avatar_url || null,
      status: (data as any).status, last_message: null, last_message_at: null, unread_count: 0,
    });
    setTab("chat");
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    let res;
    if (confirm.kind === "remove") res = await supabase.rpc("remove_friend" as any, { _friend: confirm.user.id });
    else if (confirm.kind === "block") res = await supabase.rpc("block_user" as any, { _target: confirm.user.id });
    else res = await supabase.rpc("unblock_user" as any, { _target: confirm.user.id });
    setBusy(false);
    if (res?.error) { toast({ title: "Erro", description: res.error.message, variant: "destructive" }); return; }
    toast({ title: "Feito" });
    setConfirm(null);
    loadAll();
  };

  const unreadNotifs = notifs.filter((n) => !n.read_at).length;
  const pendingReceived = requests.filter((r) => r.direction === "received").length;
  const totalUnreadMsgs = convs.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  const relationButton = (r: SearchResult) => {
    switch (r.relation_state) {
      case "friends": return <Badge variant="secondary">Amigos</Badge>;
      case "request_sent": return <Badge variant="outline">Pedido enviado</Badge>;
      case "request_received": return r.request_id
        ? <div className="flex gap-1"><Button size="sm" onClick={() => respond(r.request_id!, "accept")}><Check className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => respond(r.request_id!, "decline")}><X className="h-4 w-4" /></Button></div>
        : null;
      case "blocked_by_me": return <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "unblock", user: { id: r.user_id, name: r.display_name } })}>Desbloquear</Button>;
      default: return <Button size="sm" onClick={() => sendRequest(r.user_id)}><UserPlus className="h-4 w-4 mr-1" />Adicionar</Button>;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        <h1 className="text-2xl md:text-3xl font-bold">Social</h1>
        <div className="w-20" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full h-auto">
          <TabsTrigger value="friends">Amigos {friends.length > 0 && <Badge variant="secondary" className="ml-1">{friends.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="requests">Pedidos {pendingReceived > 0 && <Badge variant="default" className="ml-1">{pendingReceived}</Badge>}</TabsTrigger>
          <TabsTrigger value="mail">Correio {unreadNotifs > 0 && <Badge variant="default" className="ml-1">{unreadNotifs}</Badge>}</TabsTrigger>
          <TabsTrigger value="search">Pesquisar</TabsTrigger>
          <TabsTrigger value="chat">Chat {totalUnreadMsgs > 0 && <Badge variant="default" className="ml-1">{totalUnreadMsgs}</Badge>}</TabsTrigger>
          <TabsTrigger value="blocked">Bloqueados</TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="mt-4">
          <Card><CardHeader><CardTitle>Os teus amigos</CardTitle></CardHeader><CardContent>
            {friends.length === 0 ? <p className="text-muted-foreground text-center py-6">Ainda não tens amigos. Pesquisa jogadores para enviar pedidos.</p>
            : <div className="space-y-2">{friends.map((f) => (
                <div key={f.user_id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50">
                  <Avatar>{f.avatar_url && <AvatarImage src={f.avatar_url} />}<AvatarFallback>{initial(f.display_name)}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{f.display_name}</div>
                    <div className="text-xs text-muted-foreground">{f.total_points} pts · melhor streak {f.best_streak}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => openConversation(f.user_id)}><MessageCircle className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "remove", user: { id: f.user_id, name: f.display_name } })}><UserMinus className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "block", user: { id: f.user_id, name: f.display_name } })}><Ban className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <FriendRequests requests={requests} onChange={loadAll} />
        </TabsContent>

        <TabsContent value="mail" className="mt-4">
          <Mailbox notifs={notifs} onChange={loadAll} />
        </TabsContent>

        <TabsContent value="search" className="mt-4">
          <Card><CardHeader><CardTitle>Pesquisar jogadores</CardTitle></CardHeader><CardContent>
            <div className="flex gap-2 mb-4">
              <Input placeholder="Nome do jogador…" value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }} />
              <Button onClick={doSearch} disabled={searching}>{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
            </div>
            {searchResults.length === 0 ? <p className="text-muted-foreground text-center py-6">Sem resultados. Tenta um nome.</p>
            : <div className="space-y-2">{searchResults.map((r) => (
                <div key={r.user_id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <Avatar>{r.avatar_url && <AvatarImage src={r.avatar_url} />}<AvatarFallback>{initial(r.display_name)}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.display_name}</div>
                    <div className="text-xs text-muted-foreground">{r.total_points} pts</div>
                  </div>
                  {relationButton(r)}
                </div>
              ))}</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          {openChat ? (
            <PrivateChat conversationId={openChat.conversation_id} friendId={openChat.friend_id}
              friendName={openChat.friend_name} friendAvatar={openChat.avatar_url}
              status={openChat.status} meId={meId} onBack={() => { setOpenChat(null); loadAll(); }} />
          ) : (
            <Card><CardHeader><CardTitle>Conversas</CardTitle></CardHeader><CardContent>
              {convs.length === 0 ? <p className="text-muted-foreground text-center py-6">Escolhe um amigo para começar uma conversa.</p>
              : <div className="space-y-2">{convs.map((c) => (
                  <button key={c.conversation_id} onClick={() => setOpenChat(c)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 text-left">
                    <Avatar>{c.avatar_url && <AvatarImage src={c.avatar_url} />}<AvatarFallback>{initial(c.friend_name)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.friend_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.last_message || "Sem mensagens"}</div>
                    </div>
                    {c.unread_count > 0 && <Badge>{c.unread_count}</Badge>}
                  </button>
                ))}</div>}
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="blocked" className="mt-4">
          <BlockedUsers blocked={blocked} onChange={loadAll} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.kind === "remove" ? "Remover amigo" : confirm?.kind === "block" ? "Bloquear utilizador" : "Desbloquear utilizador"}
        description={
          confirm?.kind === "remove" ? "Tens a certeza que queres remover este jogador da tua lista de amigos? Esta ação também te remove da lista de amigos dele."
          : confirm?.kind === "block" ? "Tens a certeza que queres bloquear este jogador? Esta ação remove a amizade, oculta o chat entre vocês e impede interações futuras."
          : "Queres desbloquear este jogador? Isto não volta a criar a amizade automaticamente."
        }
        destructive={confirm?.kind !== "unblock"}
        loading={busy}
        onConfirm={handleConfirm}
      />
    </div>
  );
};

export default Social;
