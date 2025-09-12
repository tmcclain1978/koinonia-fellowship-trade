import { Button } from "@/components/ui/button";
import { 
  Heart, 
  Target, 
  Users2, 
  TrendingUp,
  Award,
  CheckCircle,
  ArrowRight
} from "lucide-react";

const AboutSection = () => {
  const values = [
    {
      icon: Heart,
      title: "Fellowship First",
      description: "We believe in the power of community and mutual support in achieving financial success."
    },
    {
      icon: Target,
      title: "Precision Trading",
      description: "Every strategy is backed by thorough analysis and proven methodologies."
    },
    {
      icon: Users2,
      title: "Collaborative Learning",
      description: "Learn from others' experiences and share your own insights with the community."
    }
  ];

  const achievements = [
    { number: "85%", label: "Average Success Rate", color: "success" },
    { number: "2,500+", label: "Active Members", color: "primary" },
    { number: "$2.5M+", label: "Member Profits", color: "accent" },
    { number: "5", label: "Years of Excellence", color: "warning" }
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
            More than just trading education - we're a fellowship committed to guiding each member toward financial success through proven strategies and community support.
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
                Founded on the principle that financial success is best achieved through fellowship and shared knowledge, 
                Koinonia brings together traders of all levels to learn, grow, and prosper together.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our name "Koinonia" comes from the Greek word meaning fellowship and community - values that are at the 
                heart of everything we do. We believe that when traders support each other, everyone wins.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-display text-lg font-semibold text-foreground">
                What Sets Us Apart
              </h4>
              <div className="space-y-3">
                {[
                  "Personalized mentorship from experienced traders",
                  "Real-time market analysis and trading signals",
                  "Risk management strategies that protect your capital",
                  "Supportive community that celebrates your success"
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

            {/* Achievement Stats */}
            <div className="bg-gradient-card rounded-xl p-6 border border-border">
              <h4 className="font-display text-xl font-semibold text-foreground text-center mb-6">
                Our Track Record
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {achievements.map((achievement, index) => (
                  <div key={index} className="text-center">
                    <div className={`font-display text-2xl font-bold ${getColorClass(achievement.color)} mb-1`}>
                      {achievement.number}
                    </div>
                    <div className="text-sm text-muted-foreground">{achievement.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Team Recognition */}
        <div className="text-center bg-card rounded-2xl p-12 border border-border">
          <Award className="w-16 h-16 text-primary mx-auto mb-6" />
          <h3 className="font-display text-2xl font-bold text-card-foreground mb-4">
            Recognized Excellence
          </h3>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Our commitment to ethical trading practices and member success has earned recognition from leading 
            financial education organizations and satisfied members worldwide.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              SEC Compliant
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              FINRA Registered
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              5-Star Reviews
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;