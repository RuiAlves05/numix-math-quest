import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft } from "lucide-react";

interface Props {
  name: string;
  avatarUrl: string | null;
  status: string;
  onBack: () => void;
}

const initial = (n: string) => (n?.trim()?.[0] || "U").toUpperCase();

export const ChatHeader = ({ name, avatarUrl, status, onBack }: Props) => {
  const statusLabel = status === "active" ? "Online" : status === "blocked" ? "Conversa bloqueada" : "Já não são amigos";
  const dotClass = status === "active" ? "bg-success" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-3 p-3 border-b bg-card/50 backdrop-blur">
      <Button size="icon" variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
      <Avatar className="h-10 w-10">
        {avatarUrl && <AvatarImage src={avatarUrl} />}
        <AvatarFallback>{initial(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="font-semibold truncate">{name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
          {statusLabel}
        </div>
      </div>
    </div>
  );
};
