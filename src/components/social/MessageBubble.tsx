import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  body: string;
  createdAt: string;
  isOwn: boolean;
  showSenderInfo: boolean;
  senderName: string;
  senderAvatar: string | null;
}

const initial = (n: string) => (n?.trim()?.[0] || "U").toUpperCase();

export const MessageBubble = ({ body, createdAt, isOwn, showSenderInfo, senderName, senderAvatar }: Props) => {
  const time = new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex gap-2 items-end", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn && (
        <div className="w-8 shrink-0">
          {showSenderInfo && (
            <Avatar className="h-8 w-8">
              {senderAvatar && <AvatarImage src={senderAvatar} />}
              <AvatarFallback className="text-xs">{initial(senderName)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      )}
      <div className={cn("max-w-[75%] flex flex-col", isOwn ? "items-end" : "items-start")}>
        {showSenderInfo && !isOwn && (
          <div className="text-[11px] text-muted-foreground px-1 mb-0.5">{senderName}</div>
        )}
        <div className={cn(
          "px-3 py-2 rounded-2xl text-sm break-words",
          isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"
        )}>
          {body}
        </div>
        <div className={cn("text-[10px] opacity-60 mt-0.5 px-1")}>{time}</div>
      </div>
    </div>
  );
};
