import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings } from "lucide-react";

export const ProfileSettings = ({ userId, onSaved }: { userId: string; onSaved?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [show, setShow] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("profiles")
      .select("display_name, avatar_url, show_on_leaderboard, username")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setDisplayName((data as any).display_name || data.username || "");
        setAvatarUrl((data as any).avatar_url || "");
        setShow((data as any).show_on_leaderboard ?? true);
      });
  }, [open, userId]);

  const save = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        show_on_leaderboard: show,
      } as any)
      .eq("user_id", userId);
    setLoading(false);
    if (error) {
      toast.error("Erro ao guardar perfil");
    } else {
      toast.success("Perfil atualizado");
      setOpen(false);
      onSaved?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          Perfil
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>O Teu Perfil Público</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-16 h-16">
              {avatarUrl ? <AvatarImage src={avatarUrl} /> : null}
              <AvatarFallback>{(displayName[0] || "U").toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Label htmlFor="avatar">URL do Avatar</Label>
              <Input id="avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="display">Nome Público</Label>
            <Input id="display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Como queres aparecer" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium text-sm">Aparecer no ranking</p>
              <p className="text-xs text-muted-foreground">Outros podem ver o teu nome e pontos</p>
            </div>
            <Switch checked={show} onCheckedChange={setShow} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={loading}>
            {loading ? "A guardar..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
