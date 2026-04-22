import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRank, getYearName } from "@/lib/ranks";
import { MathTutor } from "@/components/MathTutor";

interface Question {
  id: string;
  question_text: string;
  correct_answer: string;
  options: string[];
  difficulty_level: number;
  category: string;
  points: number;
}

const Quiz = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadQuiz();
  }, []);

  const loadQuiz = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      // Get user's current level
      const { data: progressData } = await supabase
        .from("user_progress")
        .select("current_level")
        .eq("user_id", session.user.id)
        .single();

      const level = progressData?.current_level || 1;
      setUserLevel(level);

      // Fetch questions for the user's level
      const { data: questionsData, error } = await supabase
        .from("questions")
        .select("*")
        .eq("difficulty_level", level)
        .limit(5);

      if (error) throw error;

      if (questionsData && questionsData.length > 0) {
        // Shuffle questions
        const shuffled = [...questionsData].sort(() => Math.random() - 0.5);
        setQuestions(shuffled);
      } else {
        toast({
          title: "Sem perguntas disponíveis",
          description: "Não há perguntas para o teu nível.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar quiz",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = async (answer: string) => {
    if (showResult) return;

    setSelectedAnswer(answer);
    setShowResult(true);

    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = answer === currentQuestion.correct_answer;

    // Save answer to database
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;

      await supabase.from("user_answers").insert({
        user_id: session.user.id,
        question_id: currentQuestion.id,
        user_answer: answer,
        is_correct: isCorrect,
        points_earned: isCorrect ? currentQuestion.points : 0,
      });

      if (isCorrect) {
        setScore(score + currentQuestion.points);

        // Update user progress
        const { data: progressData } = await supabase
          .from("user_progress")
          .select("*")
          .eq("user_id", session.user.id)
          .single();

        if (progressData) {
          await supabase
            .from("user_progress")
            .update({
              questions_completed: progressData.questions_completed + 1,
            })
            .eq("user_id", session.user.id);

          // Update profile points
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("user_id", session.user.id)
            .single();

          if (profileData) {
            await supabase
              .from("profiles")
              .update({
                total_points: profileData.total_points + currentQuestion.points,
              })
              .eq("user_id", session.user.id);
          }
        }
      }
    } catch (error: any) {
      console.error("Error saving answer:", error);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      // Quiz completed
      toast({
        title: "Quiz Completo!",
        description: `Ganhaste ${score} pontos!`,
      });
      navigate("/dashboard");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center">
        <p className="text-muted-foreground">A carregar quiz...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sem Perguntas</CardTitle>
            <CardDescription>
              Não há perguntas disponíveis para o teu nível neste momento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/dashboard")} className="w-full">
              Voltar ao Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Pontos</p>
            <p className="text-2xl font-bold text-primary">{score}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Pergunta {currentQuestionIndex + 1} de {questions.length}
            </span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {/* Question Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                {currentQuestion.category}
              </span>
              <span className="text-xs font-medium text-accent bg-accent/10 px-3 py-1 rounded-full">
                {currentQuestion.points} pontos
              </span>
            </div>
            <CardTitle className="text-2xl">{currentQuestion.question_text}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer === option;
              const isCorrect = option === currentQuestion.correct_answer;
              const showCorrect = showResult && isCorrect;
              const showWrong = showResult && isSelected && !isCorrect;

              return (
                <Button
                  key={index}
                  variant="outline"
                  className={cn(
                    "w-full h-auto py-4 px-6 text-lg justify-start",
                    showCorrect && "border-success bg-success/10 text-success",
                    showWrong && "border-destructive bg-destructive/10 text-destructive",
                    isSelected && !showResult && "border-primary bg-primary/10"
                  )}
                  onClick={() => handleAnswerSelect(option)}
                  disabled={showResult}
                >
                  <span className="flex-1 text-left">{option}</span>
                  {showCorrect && <CheckCircle2 className="w-5 h-5 ml-2" />}
                  {showWrong && <XCircle className="w-5 h-5 ml-2" />}
                </Button>
              );
            })}

            {showResult && (
              <div className="pt-4">
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
