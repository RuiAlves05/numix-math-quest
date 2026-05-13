import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

export const ConfirmDialog = ({ open, onOpenChange, title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar", destructive, loading, onConfirm }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{cancelLabel}</Button>
        <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={loading}>{confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
