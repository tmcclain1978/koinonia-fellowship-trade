import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  Users, 
  TrendingUp, 
  Shield, 
  MessageCircle, 
  Award,
  ArrowRight,
  CheckCircle,
  BarChart2
} from "lucide-react";

const ServicesSection = () => {
  const services = [
    {
      icon: BookOpen,
      title: "Trading Education",
      description: "Comprehensive courses, video tutorials, and study materials covering stock and options trading from beginner to advanced levels.",
      features: ["300+ Structured Lessons", "Strategy Study Guides", "Risk Management Education", "Video Library"],
      color: "primary"
    },
    {
      icon: BarChart2,
      title: "Market Analysis Tools",
      description: "Software tools to help you study market data, chart patterns, and practice technical analysis — for educational use only.",
      features: ["Charting Software", "Technical Indicators", "AI-Assisted Study Tools", "Market Data Visualization"],
      color: "success"
    },
    {
      icon: Shield,
      title: "Paper Trading Simulator",
      description: "Practice trading strategies in a risk-free simulated environment before applying your knowledge with real brokerages.",
      features: ["Simulated Trades", "Performance Tracking", "Strategy Backtesting", "Risk-Free Practice"],
      color: "warning"
    }
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case "primary":
        return "bg-primary/10 text-primary border-primary/20";
      case "accent":
        return "bg-accent/10 text-accent border-accent/20";
      case "success":
        return "bg-success/10 text-success border-success/20";
      case "warning":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "bg-primary/10 text-primary border-primary/20";
    }
  };

  return (
    <section id="services" className="py-20 bg-background-alt">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-6">
            Platform <span className="bg-gradient-accent bg-clip-text text-transparent">Features</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Educational software tools to help you learn stock and options trading, backed by our 
            fellowship community and structured curriculum.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {services.map((service, index) => (
            <div
              key={index}
              className="bg-card hover:bg-card-hover rounded-2xl p-8 border border-border hover:border-border-hover transition-all duration-300 shadow-card hover:shadow-elegant group"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${getColorClasses(service.color)}`}>
                  <service.icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-semibold text-xl text-card-foreground mb-2">
                    {service.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {service.description}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                {service.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                    <span className="text-sm text-card-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <Button variant="ghost" className="group w-full">
                Learn More
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="text-center bg-gradient-card rounded-2xl p-12 border border-border">
          <Award className="w-16 h-16 text-primary mx-auto mb-6" />
          <h3 className="font-display text-3xl font-bold text-foreground mb-4">
            Ready to Start Learning?
          </h3>
          <p className="text-xl text-muted-foreground mb-4 max-w-2xl mx-auto">
            Join our educational fellowship and gain access to trading courses, practice tools, and a 
            supportive community of learners.
          </p>
          <p className="text-xs text-muted-foreground mb-8 max-w-xl mx-auto italic">
            Koinonia is an educational software platform. We do not provide investment advice, 
            manage portfolios, or guarantee trading results.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg">
              Start Free Trial
            </Button>
            <Button variant="outline" size="lg">
              <MessageCircle className="w-5 h-5 mr-2" />
              Ask a Question
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
