import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch wrong answers with question details
    const { data: wrongAnswers, error } = await supabase
      .from("user_answers")
      .select("user_answer, is_correct, question_id, questions:question_id(question_text, correct_answer, category, difficulty_level)")
      .eq("user_id", user.id)
      .eq("is_correct", false)
      .order("answered_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!wrongAnswers || wrongAnswers.length === 0) {
      return new Response(JSON.stringify({
        analysis: "Ainda não tens erros para analisar! Continua a praticar e o tutor irá identificar áreas a melhorar. 🌟",
        weakCategories: [],
        suggestions: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Aggregate by category
    const byCategory: Record<string, number> = {};
    const examples: any[] = [];
    for (const a of wrongAnswers) {
      const q: any = a.questions;
      if (!q) continue;
      byCategory[q.category] = (byCategory[q.category] || 0) + 1;
      if (examples.length < 8) examples.push({ pergunta: q.question_text, resposta_certa: q.correct_answer, resposta_dada: a.user_answer, categoria: q.category });
    }

    const weakCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, n]) => ({ category: cat, errors: n }));

    const prompt = `És um tutor de matemática. Analisa estes erros de um aluno do ensino básico e devolve uma análise curta em português de Portugal.

Erros por categoria: ${JSON.stringify(byCategory)}
Exemplos: ${JSON.stringify(examples)}

Responde com:
1. Um parágrafo amigável (2-3 frases) sobre os padrões dos erros
2. 3 sugestões específicas de exercícios para melhorar (curtas, práticas)

Usa emojis e linguagem encorajadora.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        tools: [{
          type: "function",
          function: {
            name: "return_analysis",
            description: "Devolve a análise dos erros",
            parameters: {
              type: "object",
              properties: {
                analysis: { type: "string", description: "Parágrafo amigável sobre os padrões" },
                suggestions: { type: "array", items: { type: "string" }, description: "3 sugestões de exercícios" },
              },
              required: ["analysis", "suggestions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Demasiados pedidos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "Créditos esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI error");
    }

    const data = await aiResponse.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { analysis: "Não foi possível analisar.", suggestions: [] };

    return new Response(JSON.stringify({ ...parsed, weakCategories }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("error-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
