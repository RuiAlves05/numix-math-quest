import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, CheckCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "./ConfirmDialog";

export interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  read_at: string | null;
  created_at: string;
}

interface Props {
  notifs: Notif[];
  onChange: () => void;
}

export const Mailbox = ({ notifs, onChange }: Props) => {
  const { toast } = useToast();
  const [askClearAll, setAskClearAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const markAllRead = async () => {
    const { error } = await supabase.rpc("mark_all_notifications_read" as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    onChange();
  };

  const deleteOne = async (id: string) => {
    const { error } = await supabase.rpc("delete_notification" as any, { _notification_id: id });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    onChange();
  };

  const deleteAll = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("delete_all_notifications" as any);
    setBusy(false);
    setAskClearAll(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Correio limpo" });
    onChange();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Correio interno</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={markAllRead} disabled={notifs.every((n) => n.read_at)}>
            <CheckCheck className="h-4 w-4 mr-1" />Marcar todas como lidas
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAskClearAll(true)} disabled={notifs.length === 0}>
            <Trash2 className="h-4 w-4 mr-1" />Eliminar todas
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {notifs.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">Sem notificações.</p>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => (
              <div key={n.id} className={`p-3 rounded-lg border ${!n.read_at ? "bg-primary/5 border-primary/30" : ""}`}>
                <div className="flex justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{n.title}</div>
                    <div className="text-xs text-muted-foreground">{n.message}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteOne(n.id)} title="Eliminar"><X className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={askClearAll}
        onOpenChange={(v) => !v && setAskClearAll(false)}
        title="Eliminar todas as notificações"
        description="Tens a certeza que queres apagar todas as notificações do correio? Esta ação não pode ser revertida."
        destructive
        loading={busy}
        onConfirm={deleteAll}
      />
    </Card>
  );
};
