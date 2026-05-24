import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Brain, X, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/social/ConfirmDialog";

interface Memory {
  id: string;
  error_type: string;
  error_category: string | null;
  level: number | null;
  topic: string | null;
  occurrence_count: number;
  last_seen_at: string;
}

interface Props {
  triggerLabel?: string;
}

export const TutorMemorySettings = ({ triggerLabel = "Gerir memória" }: Props) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [askClear, setAskClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_tutor_error_memory" as any);
    setLoading(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setItems((data as Memory[]) || []);
  }, [toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const clearOne = async (id: string) => {
    const { error } = await supabase.rpc("clear_tutor_error" as any, { _memory_id: id });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Memória apagada" });
    load();
  };

  const clearAll = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("clear_all_tutor_memory" as any);
    setBusy(false);
    setAskClear(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Memória do tutor limpa" });
    load();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm"><Brain className="w-4 h-4 mr-2" />{triggerLabel}</Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Memória do Tutor</SheetTitle>
            <SheetDescription>
              O tutor lembra-se dos teus erros recorrentes para te dar dicas mais úteis. Podes limpar individualmente ou tudo.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setAskClear(true)} disabled={items.length === 0}>
              <Trash2 className="h-4 w-4 mr-1" />Limpar tudo
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem erros registados. Continua a praticar!</p>
            ) : items.map((m) => (
              <div key={m.id} className="flex items-center gap-2 p-3 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm capitalize">{m.error_type}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.topic && <span>{m.topic} · </span>}
                    {m.level != null && <span>Nível {m.level} · </span>}
                    <Badge variant="secondary" className="ml-1">{m.occurrence_count}×</Badge>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => clearOne(m.id)} title="Apagar"><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={askClear}
        onOpenChange={(v) => !v && setAskClear(false)}
        title="Limpar memória do tutor"
        description="Apagar todos os erros memorizados? O tutor deixará de personalizar dicas com base no histórico, mas continuará a funcionar."
        destructive
        loading={busy}
        onConfirm={clearAll}
      />
    </>
  );
};
