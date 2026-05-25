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

    // Read active tutor memory entries (the user-controlled source of truth for analysis)
    const { data: memory, error: memErr } = await supabase
      .from("tutor_error_memory")
      .select("error_type, error_category, level, topic, occurrence_count, last_seen_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("cleared_at", null)
      .order("occurrence_count", { ascending: false })
      .limit(50);

    if (memErr) throw memErr;

    if (!memory || memory.length === 0) {
      return new Response(JSON.stringify({
        analysis: "Não existem erros ativos para analisar. Continua a praticar para a análise identificar novos padrões. 🌟",
        weakCategories: [],
        suggestions: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Aggregate by error_type
    const byCategory: Record<string, number> = {};
    const examples: any[] = [];
    for (const m of memory) {
      const key = m.error_category || m.error_type;
      byCategory[key] = (byCategory[key] || 0) + (m.occurrence_count || 1);
      if (examples.length < 8) examples.push({
        tipo_erro: m.error_type,
        topico: m.topic,
        categoria: m.error_category,
        nivel: m.level,
        vezes: m.occurrence_count,
      });
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
