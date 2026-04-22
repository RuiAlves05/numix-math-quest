import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Brain, Star, Trophy, Zap } from "lucide-react";
import heroImage from "@/assets/img_1.png";
import logoImage from "@/assets/img.png";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoImage} alt="Numix" className="w-12 h-12" />
            <h1 className="text-2xl font-bold text-primary">Numix</h1>
          </div>
          <Button onClick={() => navigate("/auth")} variant="outline">
            Entrar
          </Button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
              Aprende Matemática de Forma Divertida!
            </h2>
            <p className="text-xl text-muted-foreground">
              Junta-te ao Numix e torna-te um génio da matemática com exercícios 
              interativos do 1º ao 4º ano. Ganha pontos, sobe de nível e diverte-te a aprender!
            </p>
            <div className="flex gap-4">
              <Button 
                onClick={() => navigate("/auth")} 
                size="lg"
                className="text-lg"
              >
                Começar Agora
              </Button>
              <Button 
                onClick={() => navigate("/auth")} 
                size="lg"
                variant="outline"
                className="text-lg"
              >
                Saber Mais
              </Button>
            </div>
          </div>
          <div className="relative">
            <img 
              src={heroImage} 
              alt="Mascote Numix" 
              className="w-full rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-12">
        <h3 className="text-3xl font-bold text-center mb-12 text-foreground">
          Porquê Escolher o Numix?
        </h3>
        <div className="grid md:grid-cols-4 gap-6">
          <Card className="border-primary/20 hover:border-primary transition-colors">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <Brain className="w-8 h-8 text-primary" />
              </div>
              <h4 className="font-bold text-lg">Aprende Brincando</h4>
              <p className="text-muted-foreground">
                Exercícios interativos que tornam a matemática divertida
              </p>
            </CardContent>
          </Card>

          <Card className="border-secondary/20 hover:border-secondary transition-colors">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-secondary/10 rounded-full flex items-center justify-center">
                <Trophy className="w-8 h-8 text-secondary" />
              </div>
              <h4 className="font-bold text-lg">Sistema de Níveis</h4>
              <p className="text-muted-foreground">
                Progride do 1º ao 4º ano e desbloqueia conquistas
              </p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 hover:border-accent transition-colors">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-accent/10 rounded-full flex items-center justify-center">
                <Star className="w-8 h-8 text-accent" />
              </div>
              <h4 className="font-bold text-lg">Ganha Pontos</h4>
              <p className="text-muted-foreground">
                Acumula pontos a cada resposta certa e compete com amigos
              </p>
            </CardContent>
          </Card>

          <Card className="border-success/20 hover:border-success transition-colors">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-success/10 rounded-full flex items-center justify-center">
                <Zap className="w-8 h-8 text-success" />
              </div>
              <h4 className="font-bold text-lg">Streak Diário</h4>
              <p className="text-muted-foreground">
                Mantém a tua sequência de dias e recebe recompensas
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h3 className="text-3xl md:text-4xl font-bold text-foreground">
            Pronto para Começar a Aventura?
          </h3>
          <p className="text-xl text-muted-foreground">
            Junta-te a nós e melhora as tuas notas de matemática!
          </p>
          <Button 
            onClick={() => navigate("/auth")} 
            size="lg"
            className="text-lg px-8"
          >
            Criar Conta Grátis
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-muted-foreground">
          <p>&copy; 2025 Numix. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
