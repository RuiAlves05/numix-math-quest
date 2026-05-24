import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "./ConfirmDialog";

export interface Blocked {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  blocked_at: string;
}

interface Props {
  blocked: Blocked[];
  onChange: () => void;
}

const initial = (n: string) => (n?.trim()?.[0] || "U").toUpperCase();

export const BlockedUsers = ({ blocked, onChange }: Props) => {
  const { toast } = useToast();
  const [ask, setAsk] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const doUnblock = async () => {
    if (!ask) return;
    setBusy(true);
    const { error } = await supabase.rpc("unblock_user" as any, { _target: ask.id });
    setBusy(false);
    setAsk(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Utilizador desbloqueado" });
    onChange();
  };

  return (
    <Card>
      <CardHeader><CardTitle>Utilizadores bloqueados</CardTitle></CardHeader>
      <CardContent>
        {blocked.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">Não tens utilizadores bloqueados.</p>
        ) : (
          <div className="space-y-2">
            {blocked.map((b) => (
              <div key={b.user_id} className="flex items-center gap-3 p-3 rounded-lg border">
                <Avatar>{b.avatar_url && <AvatarImage src={b.avatar_url} />}<AvatarFallback>{initial(b.display_name)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{b.display_name}</div>
                  <div className="text-xs text-muted-foreground">Bloqueado em {new Date(b.blocked_at).toLocaleDateString()}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAsk({ id: b.user_id, name: b.display_name })}>Desbloquear</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!ask}
        onOpenChange={(v) => !v && setAsk(null)}
        title={`Desbloquear ${ask?.name || ""}`}
        description="Após desbloquear, podes voltar a enviar pedidos de amizade. Isto não restaura amizades antigas automaticamente."
        loading={busy}
        onConfirm={doUnblock}
      />
    </Card>
  );
};
