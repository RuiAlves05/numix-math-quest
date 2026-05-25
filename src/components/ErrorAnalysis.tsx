import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface AnalysisResult {
  analysis: string;
  suggestions: string[];
  weakCategories: { category: string; errors: number }[];
}

export const ErrorAnalysis = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const analyse = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("error-analysis");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Não foi possível analisar.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-secondary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-secondary" />
          Análise Inteligente de Erros
        </CardTitle>
        <CardDescription>
          Analisa os teus padrões de erro ativos. Podes apagar memórias específicas para deixarem de aparecer aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result && (
          <Button onClick={analyse} disabled={loading} className="w-full">
            {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />A analisar...</>) : (<>Analisar os Meus Erros</>)}
          </Button>
        )}

        {result && (
          <div className="space-y-4">
            {result.weakCategories?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {result.weakCategories.map((c) => (
                  <span key={c.category} className="text-xs font-medium px-3 py-1 rounded-full bg-destructive/10 text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {c.category} ({c.errors})
                  </span>
                ))}
              </div>
            )}
            <div className="prose prose-sm max-w-none text-foreground">
              <ReactMarkdown>{result.analysis}</ReactMarkdown>
            </div>
            {result.suggestions?.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold text-sm">💡 Sugestões:</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-2"><span className="text-primary">•</span>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button onClick={analyse} variant="outline" disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analisar novamente"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
