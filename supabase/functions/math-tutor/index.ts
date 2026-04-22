const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, level, questionContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const levelNames: Record<number, string> = { 1: "1º ano", 2: "2º ano", 3: "3º ano", 4: "4º ano" };
    const levelName = levelNames[level] || "1º ano";

    const systemPrompt = `És o "Numix Tutor", um tutor virtual amigável de matemática para crianças do ${levelName} do ensino básico português.
- Usa linguagem simples, clara e adaptada à idade.
- Explica passo a passo com exemplos do dia-a-dia (maçãs, dinheiro, brinquedos).
- Sê encorajador e usa emojis ocasionais 🎯✨.
- NUNCA dês a resposta final diretamente quando a criança está num exercício; ajuda-a a pensar.
- Responde sempre em português de Portugal.
${questionContext ? `\nContexto da pergunta atual: "${questionContext}"` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Demasiados pedidos. Tenta novamente em breve." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos esgotados. Adiciona fundos no workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no tutor AI" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("math-tutor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
