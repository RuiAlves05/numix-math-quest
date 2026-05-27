import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/social/ConfirmDialog";
import {
  ArrowLeft, Shield, Search, Users, Mail, Trophy, Plus, MessageCircle,
  Crown, Star, UserMinus, ArrowUp, ArrowDown, Send, Loader2, Coins
} from "lucide-react";

const initial = (n: string) => (n?.trim()?.[0] || "U").toUpperCase();

interface ClanCard {
  id: string; name: string; motto: string; tag: string; emblem: string;
  recruitment_status: "open" | "selection" | "closed";
  member_count: number; competition_points: number;
}
interface Member {
  user_id: string; display_name: string; avatar_url: string | null;
  role: "leader" | "officer" | "member"; competition_points: number; joined_at: string;
}
interface PendingReq {
  id: string; user_id: string; display_name: string; avatar_url: string | null; created_at: string;
}
interface MyClanData {
  clan: { id: string; name: string; motto: string; tag: string; emblem: string;
    recruitment_status: "open" | "selection" | "closed"; leader_id: string; member_count: number };
  my_role: "leader" | "officer" | "member";
  members: Member[];
  pending_requests: PendingReq[];
  unread_mail: number;
}
interface MailItem {
  id: string; type: string; content: any; is_read: boolean;
  created_at: string; triggered_by_name: string | null;
}

const recruitmentLabel = (s: string) =>
  s === "open" ? "Aberto" : s === "selection" ? "Por Seleção" : "Fechado";

const roleBadge = (role: string) =>
  role === "leader" ? <Badge className="gap-1"><Crown className="h-3 w-3" />Líder</Badge>
  : role === "officer" ? <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Oficial</Badge>
  : <Badge variant="outline">Membro</Badge>;

const Clans = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [myClan, setMyClan] = useState<MyClanData | null>(null);

  // browse state
  const [searchTerm, setSearchTerm] = useState("");
  const [clanList, setClanList] = useState<ClanCard[]>([]);
  const [searching, setSearching] = useState(false);

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formTag, setFormTag] = useState("");
  const [formMotto, setFormMotto] = useState("");
  const [busy, setBusy] = useState(false);

  // tabs
  const [tab, setTab] = useState("members");
  const [mail, setMail] = useState<MailItem[]>([]);
  const [recruitmentDraft, setRecruitmentDraft] = useState<"open" | "selection" | "closed">("open");

  // confirms
  const [confirm, setConfirm] = useState<null | { kind: "kick" | "demote" | "transfer" | "leave"; userId?: string; name?: string }>(null);

  const loadMyClan = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_clan" as any);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setMyClan(data as MyClanData | null);
    if (data) setRecruitmentDraft((data as MyClanData).clan.recruitment_status);
    setLoading(false);
  }, [toast]);

  const searchClans = async (term = "") => {
    setSearching(true);
    const { data, error } = await supabase.rpc("search_clans" as any, { _query: term });
    setSearching(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setClanList((data as ClanCard[]) || []);
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      await loadMyClan();
    })();
  }, [navigate, loadMyClan]);

  useEffect(() => { if (!loading && !myClan) searchClans(""); }, [loading, myClan]);

  const handleJoin = async (clanId: string) => {
    const { data, error } = await supabase.rpc("join_clan" as any, { _clan_id: clanId });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    if ((data as any)?.status === "joined") { toast({ title: "Entraste no clã!" }); loadMyClan(); }
    else { toast({ title: "Pedido enviado!", description: "Aguarda aprovação." }); }
  };

  const handleCreate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("create_clan" as any,
      { _name: formName, _motto: formMotto, _tag: formTag });
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Clã criado!" });
    setCreateOpen(false); setFormName(""); setFormTag(""); setFormMotto("");
    loadMyClan();
  };

  const handleEdit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("update_clan_profile" as any,
      { _name: formName, _motto: formMotto, _tag: formTag });
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Clã atualizado!" });
    setEditOpen(false);
    loadMyClan();
  };

  const openEdit = () => {
    if (!myClan) return;
    setFormName(myClan.clan.name); setFormTag(myClan.clan.tag); setFormMotto(myClan.clan.motto);
    setEditOpen(true);
  };

  const loadMail = useCallback(async () => {
    const { data } = await supabase.rpc("get_clan_mail" as any);
    setMail((data as MailItem[]) || []);
    await supabase.rpc("mark_clan_mail_read" as any);
  }, []);

  useEffect(() => { if (tab === "mail" && myClan) loadMail(); }, [tab, myClan, loadMail]);

  const promote = async (userId: string) => {
    const { error } = await supabase.rpc("promote_to_officer" as any, { _target_user_id: userId });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Promovido a oficial" }); loadMyClan();
  };
  const doKick = async (userId: string) => {
    const { error } = await supabase.rpc("kick_clan_member" as any, { _target_user_id: userId });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Membro expulso" }); loadMyClan();
  };
  const doDemote = async (userId: string) => {
    const { error } = await supabase.rpc("demote_to_member" as any, { _target_user_id: userId });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Oficial demovido" }); loadMyClan();
  };
  const doTransfer = async (userId: string) => {
    const { error } = await supabase.rpc("transfer_leadership" as any, { _target_user_id: userId });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Liderança transferida" }); loadMyClan();
  };
  const doLeave = async () => {
    const { error } = await supabase.rpc("leave_clan" as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saíste do clã" }); setMyClan(null); setConfirm(null);
  };

  const respondReq = async (reqId: string, accept: boolean) => {
    const { error } = await supabase.rpc("respond_to_join_request" as any,
      { _request_id: reqId, _accept: accept });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: accept ? "Pedido aceite" : "Pedido recusado" });
    loadMyClan();
  };

  const saveRecruitment = async () => {
    const { error } = await supabase.rpc("update_clan_recruitment" as any, { _status: recruitmentDraft });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Recrutamento atualizado" }); loadMyClan();
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    if (confirm.kind === "kick" && confirm.userId) await doKick(confirm.userId);
    else if (confirm.kind === "demote" && confirm.userId) await doDemote(confirm.userId);
    else if (confirm.kind === "transfer" && confirm.userId) await doTransfer(confirm.userId);
    else if (confirm.kind === "leave") await doLeave();
    setBusy(false); setConfirm(null);
  };

  const mailDescription = (m: MailItem): string => {
    const c = m.content || {};
    switch (m.type) {
      case "member_kicked": return `${c.user_name} foi expulso por ${c.kicked_by_name}`;
      case "member_left": return `${c.user_name} saiu do clã`;
      case "member_promoted": return `${c.user_name} foi promovido a Oficial`;
      case "member_demoted": return `${c.user_name} foi demovido a Membro`;
      case "leadership_transferred": return `${c.old_leader_name} cedeu a liderança a ${c.new_leader_name}`;
      case "join_request": return `${c.user_name} pediu para entrar no clã`;
      default: return m.type;
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  // === SEM CLÃ ===
  if (!myClan) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
          <h1 className="text-2xl md:text-3xl font-bold">Clãs</h1>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Criar Clã</Button>
        </div>

        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input placeholder="Pesquisar clã por nome ou sigla…" value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchClans(searchTerm); }} />
              <Button onClick={() => searchClans(searchTerm)} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Clãs disponíveis</CardTitle></CardHeader>
          <CardContent>
            {clanList.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum clã encontrado.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {clanList.map((c) => {
                  const full = c.member_count >= 30;
                  const closed = c.recruitment_status === "closed";
                  return (
                    <div key={c.id} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Shield className="h-5 w-5 text-primary" />
                          <span className="font-bold">[{c.tag}] {c.name}</span>
                        </div>
                        <Badge variant="outline">{recruitmentLabel(c.recruitment_status)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3 min-h-[20px]">{c.motto || <em>Sem lema</em>}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                        <span><Users className="inline h-3 w-3 mr-1" />{c.member_count}/30</span>
                        <span><Trophy className="inline h-3 w-3 mr-1" />{c.competition_points} pts de competição</span>
                      </div>
                      <Button size="sm" className="w-full" disabled={full || closed}
                        onClick={() => handleJoin(c.id)}>
                        {full ? "Clã cheio" : closed ? "Recrutamento fechado" : "Entrar"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar novo clã</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome do clã <span className="text-xs text-muted-foreground">({formName.length}/18)</span></Label>
                <Input value={formName} maxLength={18} onChange={(e) => setFormName(e.target.value)} placeholder="Os Génios" />
              </div>
              <div>
                <Label>Sigla <span className="text-xs text-muted-foreground">({formTag.length}/3)</span></Label>
                <Input value={formTag} maxLength={3} onChange={(e) => setFormTag(e.target.value.toUpperCase())} placeholder="GEN" />
              </div>
              <div>
                <Label>Lema <span className="text-xs text-muted-foreground">({formMotto.length}/100)</span></Label>
                <Textarea value={formMotto} maxLength={100} onChange={(e) => setFormMotto(e.target.value)} placeholder="A nossa missão…" />
              </div>
              <div className="text-sm flex items-center gap-2 p-3 rounded-md bg-yellow-400/10 border border-yellow-400/30">
                <Coins className="h-4 w-4 text-yellow-600" /> Criar um clã custa <strong>1000 moedas</strong>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={busy || !formName.trim() || !formTag.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Clã"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // === COM CLÃ ===
  const { clan, my_role, members, pending_requests } = myClan;
  const isLeader = my_role === "leader";
  const isOfficer = my_role === "officer";
  const canManageRecruit = isLeader || isOfficer;
  const isSoleMember = isLeader && clan.member_count === 1;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        <Button variant="outline" onClick={() => navigate("/social?tab=clan")}>
          <MessageCircle className="h-4 w-4 mr-2" />Chat do Clã
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Shield className="h-7 w-7 text-primary" />
                <h1 className="text-2xl font-bold">[{clan.tag}] {clan.name}</h1>
                <Badge variant="outline">{recruitmentLabel(clan.recruitment_status)}</Badge>
              </div>
              <p className="text-muted-foreground mb-2">{clan.motto || <em>Sem lema</em>}</p>
              <p className="text-sm text-muted-foreground">
                <Users className="inline h-4 w-4 mr-1" />{clan.member_count}/30 membros
              </p>
            </div>
            <div className="flex gap-2">
              {isLeader && <Button variant="outline" onClick={openEdit}>Editar Clã</Button>}
              <Button variant="destructive" onClick={() => setConfirm({ kind: "leave" })}>
                {isSoleMember ? "Dissolver Clã" : "Sair do Clã"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto">
          <TabsTrigger value="members"><Users className="h-4 w-4 mr-1" />Membros</TabsTrigger>
          <TabsTrigger value="mail">
            <Mail className="h-4 w-4 mr-1" />Correio
            {myClan.unread_mail > 0 && <Badge className="ml-1">{myClan.unread_mail}</Badge>}
          </TabsTrigger>
          {canManageRecruit && <TabsTrigger value="recruit">Recrutamento</TabsTrigger>}
          <TabsTrigger value="competition"><Trophy className="h-4 w-4 mr-1" />Competição</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card><CardContent className="pt-6 space-y-2">
            {members.map((m) => {
              const isMe = m.user_id; // always present
              const canKick = (isLeader && m.user_id !== clan.leader_id)
                || (isOfficer && m.role === "member");
              const canPromote = isLeader && m.role === "member";
              const canDemote = isLeader && m.role === "officer";
              const canTransfer = isLeader && m.role === "officer";
              return (
                <div key={m.user_id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <Avatar>{m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback>{initial(m.display_name)}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{m.display_name}</span>
                      {roleBadge(m.role)}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.competition_points} pts de competição</div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {canPromote && (
                      <Button size="sm" variant="outline" onClick={() => promote(m.user_id)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    )}
                    {canDemote && (
                      <Button size="sm" variant="outline"
                        onClick={() => setConfirm({ kind: "demote", userId: m.user_id, name: m.display_name })}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    )}
                    {canTransfer && (
                      <Button size="sm" variant="outline"
                        onClick={() => setConfirm({ kind: "transfer", userId: m.user_id, name: m.display_name })}>
                        <Crown className="h-4 w-4" />
                      </Button>
                    )}
                    {canKick && (
                      <Button size="sm" variant="outline"
                        onClick={() => setConfirm({ kind: "kick", userId: m.user_id, name: m.display_name })}>
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="mail" className="mt-4">
          <Card><CardContent className="pt-6">
            {mail.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Sem correio do clã.</p>
            ) : (
              <div className="space-y-2">
                {mail.filter((m) => m.type !== "join_request" || canManageRecruit).map((m) => (
                  <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm">{mailDescription(m)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(m.created_at).toLocaleString("pt-PT")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        {canManageRecruit && (
          <TabsContent value="recruit" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle>Estado de recrutamento</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(["open", "selection", "closed"] as const).map((s) => (
                  <label key={s} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${recruitmentDraft === s ? "border-primary bg-primary/5" : ""}`}>
                    <input type="radio" name="recruit" checked={recruitmentDraft === s}
                      onChange={() => setRecruitmentDraft(s)} className="mt-1" />
                    <div>
                      <div className="font-medium">{recruitmentLabel(s)}</div>
                      <div className="text-xs text-muted-foreground">
                        {s === "open" && "Qualquer pessoa entra diretamente."}
                        {s === "selection" && "Os pedidos têm de ser aprovados por líder ou oficiais."}
                        {s === "closed" && "Ninguém pode entrar."}
                      </div>
                    </div>
                  </label>
                ))}
                <Button onClick={saveRecruitment}>Guardar</Button>
              </CardContent>
            </Card>

            {recruitmentDraft === "selection" && (
              <Card>
                <CardHeader><CardTitle>Pedidos pendentes</CardTitle></CardHeader>
                <CardContent>
                  {pending_requests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6">Sem pedidos.</p>
                  ) : (
                    <div className="space-y-2">
                      {pending_requests.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <Avatar>{r.avatar_url && <AvatarImage src={r.avatar_url} />}
                            <AvatarFallback>{initial(r.display_name)}</AvatarFallback></Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{r.display_name}</div>
                          </div>
                          <Button size="sm" onClick={() => respondReq(r.id, true)}>Aceitar</Button>
                          <Button size="sm" variant="outline" onClick={() => respondReq(r.id, false)}>Recusar</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="competition" className="mt-4">
          <Card><CardContent className="pt-10 pb-10 text-center">
            <Trophy className="h-12 w-12 mx-auto text-primary mb-3" />
            <h3 className="text-xl font-bold mb-2">🏆 Em breve</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              As competições de clãs estão a chegar! Desafia outros clãs e compete pelo topo do ranking.
            </p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar clã</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do clã <span className="text-xs text-muted-foreground">({formName.length}/18)</span></Label>
              <Input value={formName} maxLength={18} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>Sigla <span className="text-xs text-muted-foreground">({formTag.length}/3)</span></Label>
              <Input value={formTag} maxLength={3} onChange={(e) => setFormTag(e.target.value.toUpperCase())} />
            </div>
            <div>
              <Label>Lema <span className="text-xs text-muted-foreground">({formMotto.length}/100)</span></Label>
              <Textarea value={formMotto} maxLength={100} onChange={(e) => setFormMotto(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={busy || !formName.trim() || !formTag.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={
          confirm?.kind === "kick" ? "Expulsar membro"
          : confirm?.kind === "demote" ? "Demover oficial"
          : confirm?.kind === "transfer" ? "Ceder liderança"
          : isSoleMember ? "Dissolver clã" : "Sair do clã"
        }
        description={
          confirm?.kind === "kick" ? `Tens a certeza que queres expulsar ${confirm.name}?`
          : confirm?.kind === "demote" ? `Demover ${confirm?.name} a membro?`
          : confirm?.kind === "transfer" ? `Ceder a liderança a ${confirm?.name}? Vais passar a oficial.`
          : isSoleMember ? "És o único membro. O clã será dissolvido permanentemente."
          : "Tens a certeza que queres sair do clã?"
        }
        destructive={confirm?.kind !== "transfer"}
        loading={busy}
        onConfirm={handleConfirm}
      />
    </div>
  );
};

export default Clans;
