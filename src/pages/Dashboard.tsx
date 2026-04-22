import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Star, Flame, BookOpen, LogOut } from "lucide-react";
import logoImage from "@/assets/img.png";

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

      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (profileError) throw profileError;

      // Fetch progress
      const { data: progressData, error: progressError } = await supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (progressError) throw progressError;

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

  const getLevelName = (level: number) => {
    const levels = ["1º Ano", "2º Ano", "3º Ano", "4º Ano"];
    return levels[level - 1] || "1º Ano";
  };

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

          <Card className="border-secondary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center">
                  <Star className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{getLevelName(profile?.level || 1)}</p>
                  <p className="text-sm text-muted-foreground">Nível</p>
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
                <span className="font-medium">{getLevelName(progress?.current_level || 1)}</span>
              </div>
              <Progress value={(progress?.questions_completed || 0) % 10 * 10} />
              <p className="text-xs text-muted-foreground text-center">
                {10 - ((progress?.questions_completed || 0) % 10)} perguntas para o próximo nível
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-primary/20 cursor-pointer hover:border-primary transition-colors" onClick={() => navigate("/quiz")}>
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">Começar Quiz</h3>
                <p className="text-muted-foreground text-sm">
                  Responde a perguntas do teu nível e ganha pontos!
                </p>
              </div>
              <Button className="w-full">Praticar Agora</Button>
            </CardContent>
          </Card>

          <Card className="border-muted cursor-not-allowed opacity-60">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                <Trophy className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">Desafios Especiais</h3>
                <p className="text-muted-foreground text-sm">
                  Em breve! Desafios únicos e recompensas exclusivas.
                </p>
              </div>
              <Button className="w-full" disabled>Em Breve</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
