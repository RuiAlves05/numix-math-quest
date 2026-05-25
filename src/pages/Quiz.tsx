import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, XCircle, Flame, Zap, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRank, getYearName } from "@/lib/ranks";
import { getLevelFromCorrectAnswers } from "@/lib/progression";
import { getStreakInfo, previewMultiplier } from "@/lib/streak";
import { MathTutor } from "@/components/MathTutor";

interface Question {
  id: string;
  question_text: string;
  options: string[];
  difficulty_level: number;
  category: string;
  topic: string | null;
  difficulty: string | null;
  points: number;
}

interface SubmitResult {
  correct: boolean;
  correct_answer: string;
  explanation: string | null;
  points_earned: number;
  base_points: number;
  multiplier: number;
  current_streak: number;
  best_streak: number;
  level: number;
  total_level_points: number;
  topic: string | null;
}

const Quiz = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { toast } = useToast();
  const urlLevel = params.level ? Number(params.level) : undefined;
  const stateLevel = (location.state as any)?.level as number | undefined;
  const requestedLevel = urlLevel ?? stateLevel;

  useEffect(() => { loadQuiz(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [urlLevel]);

  const loadQuiz = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const { data: progressData } = await supabase
        .from("user_progress")
        .select("current_level, questions_completed")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const maxLevel = Math.max(
        progressData?.current_level || 1,
        getLevelFromCorrectAnswers(progressData?.questions_completed || 0),
      );

      if (!requestedLevel || !Number.isInteger(requestedLevel) || requestedLevel < 1 || requestedLevel > 4) {
        toast({ title: "Nível inválido", description: "Escolhe um nível válido.", variant: "destructive" });
        navigate("/dashboard");
        return;
      }
      if (requestedLevel > maxLevel) {
        toast({ title: "Nível bloqueado", description: "Ainda não desbloqueaste este nível.", variant: "destructive" });
        navigate("/dashboard");
        return;
      }
      const level = requestedLevel;
      setUserLevel(level);

      const { data: stats } = await supabase
        .from("user_level_stats" as any)
        .select("current_streak")
        .eq("user_id", session.user.id)
        .eq("level", level)
        .maybeSingle();
      setStreak((stats as any)?.current_streak || 0);

      // Use server-side random selection (correct_answer NOT returned)
      const { data: questionsData, error } = await supabase.rpc("get_random_quiz_questions" as any, { _level: level });
      if (error) throw error;

      if (questionsData && (questionsData as any[]).length > 0) {
        setQuestions(questionsData as unknown as Question[]);
      } else {
        toast({ title: "Sem perguntas disponíveis", description: "Não há perguntas para o teu nível.", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao carregar quiz", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = async (answer: string) => {
    if (showResult || submitting) return;
    setSelectedAnswer(answer);
    setSubmitting(true);

    const currentQuestion = questions[currentQuestionIndex];
    const prevStreak = streak;

    try {
      const { data, error } = await supabase.rpc("submit_answer" as any, {
        _question_id: currentQuestion.id,
        _user_answer: answer,
      });
      if (error) throw error;
      const res = data as unknown as SubmitResult;
      setLastResult(res);
      setStreak(res.current_streak);
      setShowResult(true);

      if (res.correct) {
        setScore((s) => s + res.points_earned);
        const prevTier = getStreakInfo(prevStreak).multiplier;
        if (res.multiplier > prevTier) {
          toast({ title: "🔥 Multiplicador aumentado!", description: `Agora ganhas ${res.multiplier}x pontos.` });
        }
      } else if (prevStreak >= 5) {
        toast({ title: "💔 Streak perdida", description: "Tenta começar uma nova sequência!", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setSelectedAnswer(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setLastResult(null);
    } else {
      toast({ title: "Quiz Completo!", description: `Ganhaste ${score} pontos!` });
      navigate("/dashboard");
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center"><p className="text-muted-foreground">A carregar quiz...</p></div>;
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Sem Perguntas</CardTitle><CardDescription>Não há perguntas disponíveis para o teu nível neste momento.</CardDescription></CardHeader>
          <CardContent><Button onClick={() => navigate("/dashboard")} className="w-full">Voltar ao Dashboard</Button></CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const streakInfo = getStreakInfo(streak);
  const previewMult = previewMultiplier(streak);
  const possiblePoints = Math.round((currentQuestion.points || 10) * previewMult);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button>
          <div className="text-right"><p className="text-sm text-muted-foreground">Pontos</p><p className="text-2xl font-bold text-primary">{score}</p></div>
        </div>

        <div className="mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pergunta {currentQuestionIndex + 1} de {questions.length}</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <Card className="mb-4 border-accent/30 bg-accent/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Flame className={cn("w-5 h-5", streak >= 5 ? "text-accent" : "text-muted-foreground")} />
                <span className="font-semibold">Streak: {streak}</span>
                <Badge variant="secondary" className="gap-1"><Zap className="w-3 h-3" /> {streakInfo.multiplier}x</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {streakInfo.nextThreshold ? `Acerta mais ${streakInfo.toNext} para subir o multiplicador` : "Multiplicador máximo!"}
              </div>
              <div className="text-sm">Esta vale <span className="font-bold text-primary">{possiblePoints}</span> pts</div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-4 flex items-center justify-between">
          <span className={cn("text-sm font-bold px-4 py-1.5 rounded-full border-2", getRank(userLevel).bgClass, getRank(userLevel).borderClass, getRank(userLevel).colorClass)}>
            {getRank(userLevel).emoji} {getRank(userLevel).name} · {getYearName(userLevel)}
          </span>
          <MathTutor level={userLevel} questionContext={questions[currentQuestionIndex]?.question_text} triggerLabel="Tutor AI" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">{currentQuestion.category}</span>
              <span className="text-xs font-medium text-accent bg-accent/10 px-3 py-1 rounded-full">{currentQuestion.points} pts base</span>
            </div>
            <CardTitle className="text-2xl">{currentQuestion.question_text}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer === option;
              const correctAnswer = lastResult?.correct_answer;
              const isCorrect = option === correctAnswer;
              const showCorrect = showResult && isCorrect;
              const showWrong = showResult && isSelected && !isCorrect;

              return (
                <Button key={index} variant="outline"
                  className={cn("w-full h-auto py-4 px-6 text-lg justify-start",
                    showCorrect && "border-success bg-success/10 text-success",
                    showWrong && "border-destructive bg-destructive/10 text-destructive",
                    isSelected && !showResult && "border-primary bg-primary/10")}
                  onClick={() => handleAnswerSelect(option)}
                  disabled={showResult || submitting}>
                  <span className="flex-1 text-left">{option}</span>
                  {showCorrect && <CheckCircle2 className="w-5 h-5 ml-2" />}
                  {showWrong && <XCircle className="w-5 h-5 ml-2" />}
                </Button>
              );
            })}

            {showResult && lastResult && (
              <div className="pt-4 space-y-3">
                <div className="text-center text-sm text-muted-foreground">
                  {lastResult.correct ? (
                    <>Ganhaste <span className="font-bold text-primary">{lastResult.points_earned}</span> pts ({lastResult.base_points} × {lastResult.multiplier})</>
                  ) : (<>Resposta errada. Streak reiniciada.</>)}
                </div>
                {lastResult.explanation && (
                  <div className="flex gap-2 items-start p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                    <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div><span className="font-semibold text-primary">Explicação: </span>{lastResult.explanation}</div>
                  </div>
                )}
                <Button onClick={handleNext} className="w-full" size="lg">
                  {currentQuestionIndex < questions.length - 1 ? "Próxima Pergunta" : "Concluir Quiz"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Quiz;
