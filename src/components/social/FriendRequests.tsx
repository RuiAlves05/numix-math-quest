import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface FriendReq {
  id: string;
  direction: "sent" | "received";
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
}

interface Props {
  requests: FriendReq[];
  onChange: () => void;
}

const initial = (n: string) => (n?.trim()?.[0] || "U").toUpperCase();

export const FriendRequests = ({ requests, onChange }: Props) => {
  const { toast } = useToast();
  const received = requests.filter((r) => r.direction === "received");
  const sent = requests.filter((r) => r.direction === "sent");

  const respond = async (id: string, action: "accept" | "decline") => {
    const { error } = await supabase.rpc("respond_friend_request" as any, { _request_id: id, _action: action });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: action === "accept" ? "Pedido aceite" : "Pedido recusado" });
    onChange();
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.rpc("cancel_friend_request" as any, { _request_id: id });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pedido cancelado" });
    onChange();
  };

  const row = (r: FriendReq) => (
    <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border">
      <Avatar>{r.avatar_url && <AvatarImage src={r.avatar_url} />}<AvatarFallback>{initial(r.display_name)}</AvatarFallback></Avatar>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{r.display_name}</div>
        <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
      </div>
      {r.direction === "received" ? (
        <div className="flex gap-1">
          <Button size="sm" onClick={() => respond(r.id, "accept")}><Check className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => respond(r.id, "decline")}><X className="h-4 w-4" /></Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => cancel(r.id)}>Cancelar</Button>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader><CardTitle>Pedidos de amizade</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="received">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="received">Recebidos {received.length > 0 && <Badge variant="default" className="ml-1">{received.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="sent">Enviados {sent.length > 0 && <Badge variant="secondary" className="ml-1">{sent.length}</Badge>}</TabsTrigger>
          </TabsList>
          <TabsContent value="received" className="mt-3">
            {received.length === 0 ? <p className="text-muted-foreground text-center py-6">Sem pedidos recebidos.</p> : <div className="space-y-2">{received.map(row)}</div>}
          </TabsContent>
          <TabsContent value="sent" className="mt-3">
            {sent.length === 0 ? <p className="text-muted-foreground text-center py-6">Não enviaste pedidos.</p> : <div className="space-y-2">{sent.map(row)}</div>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
