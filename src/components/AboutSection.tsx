import { Button } from "@/components/ui/button";
import { 
  Heart, 
  Target, 
  Users2, 
  Award,
  CheckCircle,
  ArrowRight
} from "lucide-react";

const AboutSection = () => {
  const values = [
    {
      icon: Heart,
      title: "Fellowship First",
      description: "We believe in the power of community and mutual support in learning to trade responsibly."
    },
    {
      icon: Target,
      title: "Education-Driven",
      description: "Every tool and lesson is designed to help you understand market mechanics and build your own strategies."
    },
    {
      icon: Users2,
      title: "Collaborative Learning",
      description: "Learn from others' experiences and share your own insights with the community."
    }
  ];

  const highlights = [
    { number: "300+", label: "Educational Lessons", color: "success" },
    { number: "4", label: "Curriculum Levels", color: "primary" },
    { number: "57", label: "Course Modules", color: "accent" },
    { number: "24/7", label: "Platform Access", color: "warning" }
  ];

  const getColorClass = (color: string) => {
    switch (color) {
      case "success": return "text-success";
      case "primary": return "text-primary";
      case "accent": return "text-accent";
      case "warning": return "text-warning";
      default: return "text-primary";
    }
  };

  return (
    <section id="about" className="py-20 bg-background">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-6">
            About <span className="bg-gradient-accent bg-clip-text text-transparent">Koinonia</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            An educational trading software platform — we provide tools and resources to help you 
            learn about stock and options trading at your own pace.
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-16">
          {/* Left: Story */}
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-display text-2xl font-semibold text-foreground">
                Our Mission
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Founded on the principle that financial literacy is best achieved through fellowship and shared knowledge, 
                Koinonia brings together learners of all levels to study, practice, and grow together.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our name "Koinonia" comes from the Greek word meaning fellowship and community — values that are at the 
                heart of everything we do. We provide software tools for education, not investment advice.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-display text-lg font-semibold text-foreground">
                What Sets Us Apart
              </h4>
              <div className="space-y-3">
                {[
                  "Comprehensive curriculum from beginner to advanced",
                  "Paper trading simulator for risk-free practice",
                  "AI-powered educational analysis tools",
                  "Supportive community of fellow learners"
                ].map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button variant="hero" size="lg" className="group">
              Join Our Fellowship
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          {/* Right: Values & Stats */}
          <div className="space-y-8">
            {/* Core Values */}
            <div className="space-y-6">
              <h4 className="font-display text-xl font-semibold text-foreground text-center">
                Our Core Values
              </h4>
              <div className="space-y-4">
                {values.map((value, index) => (
                  <div key={index} className="flex items-start gap-4 p-4 bg-card rounded-lg border border-border">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <value.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h5 className="font-semibold text-card-foreground mb-1">{value.title}</h5>
                      <p className="text-sm text-muted-foreground">{value.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform Highlights */}
            <div className="bg-gradient-card rounded-xl p-6 border border-border">
              <h4 className="font-display text-xl font-semibold text-foreground text-center mb-6">
                Platform Highlights
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {highlights.map((item, index) => (
                  <div key={index} className="text-center">
                    <div className={`font-display text-2xl font-bold ${getColorClass(item.color)} mb-1`}>
                      {item.number}
                    </div>
                    <div className="text-sm text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Disclaimer Section */}
        <div className="text-center bg-card rounded-2xl p-12 border border-border">
          <Award className="w-16 h-16 text-primary mx-auto mb-6" />
          <h3 className="font-display text-2xl font-bold text-card-foreground mb-4">
            Educational Software Platform
          </h3>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Koinonia is a software tool designed for trading education and practice. We do not manage 
            client portfolios, provide personalized investment advice, or act as a broker-dealer. 
            All trading decisions are made solely by the user.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Educational Software Tool
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Not Investment Advice
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              User-Directed Trading Only
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
