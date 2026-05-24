import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Flame, BookOpen, LogOut, Medal, Users } from "lucide-react";
import logoImage from "@/assets/img.png";
import { getRank, getYearName, RANKS } from "@/lib/ranks";
import { getLevelFromCorrectAnswers, getLevelProgress } from "@/lib/progression";
import { ErrorAnalysis } from "@/components/ErrorAnalysis";
import { Leaderboard } from "@/components/Leaderboard";
import { ProfileSettings } from "@/components/ProfileSettings";
import { TutorMemorySettings } from "@/components/tutor/TutorMemorySettings";
import { cn } from "@/lib/utils";

interface Profile {
  username: string;
  level: number;
  total_points: number;
  streak_days: number;
}

interface UserProgress {
  current_level: number;
  questions_completed: number;
  current_streak: number;
}

interface LevelStat {
  level: number;
  points: number;
  correct_answers: number;
  total_answers: number;
  current_streak: number;
  best_streak: number;
}

const Dashboard = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [stats, setStats] = useState<LevelStat[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => { checkUser(); }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUserId(session.user.id);

      let { data: profileData } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle();
      if (!profileData) {
        const username = (session.user.user_metadata as any)?.username || session.user.email?.split("@")[0] || "Aluno";
        const { data: created } = await supabase.from("profiles").insert({ user_id: session.user.id, username, level: 1, total_points: 0, streak_days: 0 }).select().single();
        profileData = created;
      }

      let { data: progressData } = await supabase.from("user_progress").select("*").eq("user_id", session.user.id).maybeSingle();
      if (!progressData) {
        const { data: created } = await supabase.from("user_progress").insert({ user_id: session.user.id, current_level: 1, questions_completed: 0, current_streak: 0 }).select().single();
        progressData = created;
      }

      const derivedLevel = getLevelFromCorrectAnswers(progressData?.questions_completed || 0);
      if ((progressData?.current_level || 1) < derivedLevel) {
        await supabase.from("user_progress").update({ current_level: derivedLevel }).eq("user_id", session.user.id);
        progressData = { ...progressData, current_level: derivedLevel };
      }
      if ((profileData?.level || 1) < derivedLevel) {
        await supabase.from("profiles").update({ level: derivedLevel }).eq("user_id", session.user.id);
        profileData = { ...profileData, level: derivedLevel };
      }

      const { data: levelStats } = await supabase
        .from("user_level_stats" as any)
        .select("level, points, correct_answers, total_answers, current_streak, best_streak")
        .eq("user_id", session.user.id);

      setProfile(profileData);
      setProgress(progressData);
      setStats((levelStats as unknown as LevelStat[]) || []);
    } catch (error: any) {
      toast({ title: "Erro ao carregar dados", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); navigate("/"); };

  const getLevelName = getYearName;
  const unlockedLevel = getLevelFromCorrectAnswers(progress?.questions_completed || 0);
  const userMaxLevel = Math.max(profile?.level || 1, progress?.current_level || 1, unlockedLevel);
  const progressState = getLevelProgress(progress?.questions_completed || 0, unlockedLevel);
  const statByLevel = (l: number) => stats.find((s) => s.level === l);

  if (loading) {
    return <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center"><p className="text-muted-foreground">A carregar...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoImage} alt="Numix" className="w-12 h-12" />
            <h1 className="text-2xl font-bold text-primary">Numix</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => navigate("/social")} variant="outline" size="sm">
              <Users className="w-4 h-4 mr-2" />Social
            </Button>
            <TutorMemorySettings />
            {userId && <ProfileSettings userId={userId} onSaved={checkUser} />}
            <Button onClick={handleSignOut} variant="outline" size="sm">
              <LogOut className="w-4 h-4 mr-2" />Sair
            </Button>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-foreground">Olá, {profile?.username}! 👋</h2>
          <p className="text-muted-foreground">Estás pronto para mais um dia de aventuras matemáticas?</p>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Card className="border-primary/20"><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center"><Trophy className="w-6 h-6 text-primary" /></div><div><p className="text-2xl font-bold text-foreground">{profile?.total_points}</p><p className="text-sm text-muted-foreground">Pontos</p></div></div></CardContent></Card>
          <Card className={cn("border-2", getRank(userMaxLevel).borderClass)}><CardContent className="pt-6"><div className="flex items-center gap-4"><div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-2xl", getRank(userMaxLevel).bgClass)}>{getRank(userMaxLevel).emoji}</div><div><p className={cn("text-2xl font-bold", getRank(userMaxLevel).colorClass)}>{getRank(userMaxLevel).name}</p><p className="text-sm text-muted-foreground">{getLevelName(userMaxLevel)}</p></div></div></CardContent></Card>
          <Card className="border-accent/20"><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center"><Flame className="w-6 h-6 text-accent" /></div><div><p className="text-2xl font-bold text-foreground">{profile?.streak_days}</p><p className="text-sm text-muted-foreground">Dias Seguidos</p></div></div></CardContent></Card>
          <Card className="border-success/20"><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center"><BookOpen className="w-6 h-6 text-success" /></div><div><p className="text-2xl font-bold text-foreground">{progress?.questions_completed}</p><p className="text-sm text-muted-foreground">Perguntas</p></div></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>O Teu Progresso</CardTitle>
            <CardDescription>Continua a responder perguntas para subir de nível!</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Nível Atual</span>
                <span className="font-medium">{getLevelName(progressState.currentLevel)}</span>
              </div>
              <Progress value={progressState.progressPercentage} />
              <p className="text-xs text-muted-foreground text-center">
                {progressState.isMaxLevel ? "Atingiste o nível máximo! 🏆" : progressState.remainingQuestions === 0 ? "Nível desbloqueado! Pronto para avançar 🚀" : `${progressState.remainingQuestions} respostas certas para desbloquear o próximo nível`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Escolhe o Teu Nível</CardTitle>
            <CardDescription>Conquista cada rank para desbloquear o seguinte!</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((lvl) => {
                const rank = RANKS[lvl];
                const unlocked = lvl <= userMaxLevel;
                return (
                  <button key={lvl} disabled={!unlocked} onClick={() => navigate("/quiz", { state: { level: lvl } })}
                    className={cn("p-4 rounded-2xl border-2 transition-all text-center", unlocked ? `${rank.borderClass} ${rank.bgClass} hover:scale-105 cursor-pointer` : "border-muted bg-muted/30 opacity-60 cursor-not-allowed")}>
                    <div className="text-4xl mb-2">{unlocked ? rank.emoji : "🔒"}</div>
                    <div className={cn("font-bold text-sm", unlocked ? rank.colorClass : "text-muted-foreground")}>{rank.name}</div>
                    <div className="text-xs text-muted-foreground">{getYearName(lvl)}</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Per-level performance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>O Teu Desempenho por Nível</CardTitle>
              <CardDescription>Pontos, acertos e streaks em cada rank</CardDescription>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Medal className="w-4 h-4 mr-2" />Ver ranking</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Ranking</DialogTitle></DialogHeader>
                <Leaderboard defaultLevel={userMaxLevel} currentUserId={userId} />
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((lvl) => {
                const s = statByLevel(lvl);
                const rank = RANKS[lvl];
                const accuracy = s && s.total_answers > 0 ? Math.round((s.correct_answers / s.total_answers) * 100) : 0;
                return (
                  <div key={lvl} className={cn("p-4 rounded-xl border-2", rank.borderClass, rank.bgClass)}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{rank.emoji}</span>
                        <span className={cn("font-bold", rank.colorClass)}>{rank.name}</span>
                      </div>
                      <span className="text-lg font-bold">{s?.points || 0} pts</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>Acertos: <span className="font-medium text-foreground">{s?.correct_answers || 0}/{s?.total_answers || 0}</span></div>
                      <div>Acerto: <span className="font-medium text-foreground">{accuracy}%</span></div>
                      <div className="flex items-center gap-1">Streak: <span className="font-medium text-foreground">{s?.current_streak || 0}</span></div>
                      <div>Melhor: <span className="font-medium text-foreground">{s?.best_streak || 0}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Inline Leaderboard preview */}
        <Card>
          <CardHeader>
            <CardTitle>🏆 Ranking</CardTitle>
            <CardDescription>Top jogadores em cada nível</CardDescription>
          </CardHeader>
          <CardContent>
            <Leaderboard defaultLevel={userMaxLevel} currentUserId={userId} />
          </CardContent>
        </Card>

        <ErrorAnalysis />
      </main>
    </div>
  );
};

export default Dashboard;
