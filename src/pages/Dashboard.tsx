import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Star, Flame, BookOpen, LogOut, Lock } from "lucide-react";
import logoImage from "@/assets/img.png";
import { getRank, getYearName, RANKS } from "@/lib/ranks";
import { getLevelFromCorrectAnswers, getLevelProgress } from "@/lib/progression";
import { ErrorAnalysis } from "@/components/ErrorAnalysis";
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

const Dashboard = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      // Fetch profile (auto-create if missing)
      let { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!profileData) {
        const username =
          (session.user.user_metadata as any)?.username ||
          session.user.email?.split("@")[0] ||
          "Aluno";
        const { data: created } = await supabase
          .from("profiles")
          .insert({ user_id: session.user.id, username, level: 1, total_points: 0, streak_days: 0 })
          .select()
          .single();
        profileData = created;
      }

      // Fetch progress (auto-create if missing)
      let { data: progressData } = await supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!progressData) {
        const { data: created } = await supabase
          .from("user_progress")
          .insert({ user_id: session.user.id, current_level: 1, questions_completed: 0, current_streak: 0 })
          .select()
          .single();
        progressData = created;
      }

      setProfile(profileData);
      setProgress(progressData);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const getLevelName = getYearName;
  const unlockedLevel = getLevelFromCorrectAnswers(progress?.questions_completed || 0);
  const userMaxLevel = Math.max(profile?.level || 1, progress?.current_level || 1, unlockedLevel);
  const progressState = getLevelProgress(progress?.questions_completed || 0, progress?.current_level || 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center">
        <p className="text-muted-foreground">A carregar...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoImage} alt="Numix" className="w-12 h-12" />
            <h1 className="text-2xl font-bold text-primary">Numix</h1>
          </div>
          <Button onClick={handleSignOut} variant="outline" size="sm">
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Welcome Section */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-foreground">
            Olá, {profile?.username}! 👋
          </h2>
          <p className="text-muted-foreground">
            Estás pronto para mais um dia de aventuras matemáticas?
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-4">
          <Card className="border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{profile?.total_points}</p>
                  <p className="text-sm text-muted-foreground">Pontos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("border-2", getRank(profile?.level || 1).borderClass)}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-2xl", getRank(profile?.level || 1).bgClass)}>
                  {getRank(profile?.level || 1).emoji}
                </div>
                <div>
                  <p className={cn("text-2xl font-bold", getRank(profile?.level || 1).colorClass)}>{getRank(profile?.level || 1).name}</p>
                  <p className="text-sm text-muted-foreground">{getLevelName(profile?.level || 1)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-accent/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                  <Flame className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{profile?.streak_days}</p>
                  <p className="text-sm text-muted-foreground">Dias Seguidos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-success/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{progress?.questions_completed}</p>
                  <p className="text-sm text-muted-foreground">Perguntas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Progress Section */}
        <Card>
          <CardHeader>
            <CardTitle>O Teu Progresso</CardTitle>
            <CardDescription>
              Continua a responder perguntas para subir de nível!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Nível Atual</span>
                  <span className="font-medium">{getLevelName(progressState.currentLevel)}</span>
                </div>
                <Progress value={progressState.progressPercentage} />
                <p className="text-xs text-muted-foreground text-center">
                  {progressState.isMaxLevel
                    ? "Atingiste o nível máximo! 🏆"
                    : progressState.remainingQuestions === 0
                      ? "Nível desbloqueado! Pronto para avançar 🚀"
                      : `${progressState.remainingQuestions} respostas certas para desbloquear o próximo nível`}
                </p>
              </div>
          </CardContent>
        </Card>

        {/* Level Selection */}
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
                  <button
                    key={lvl}
                    disabled={!unlocked}
                    onClick={() => navigate("/quiz", { state: { level: lvl } })}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all text-center",
                      unlocked ? `${rank.borderClass} ${rank.bgClass} hover:scale-105 cursor-pointer` : "border-muted bg-muted/30 opacity-60 cursor-not-allowed"
                    )}
                  >
                    <div className="text-4xl mb-2">{unlocked ? rank.emoji : "🔒"}</div>
                    <div className={cn("font-bold text-sm", unlocked ? rank.colorClass : "text-muted-foreground")}>{rank.name}</div>
                    <div className="text-xs text-muted-foreground">{getYearName(lvl)}</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* AI Error Analysis */}
        <ErrorAnalysis />
      </main>
    </div>
  );
};

export default Dashboard;
