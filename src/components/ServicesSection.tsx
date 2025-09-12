import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  Users, 
  TrendingUp, 
  Shield, 
  MessageCircle, 
  Award,
  ArrowRight,
  CheckCircle
} from "lucide-react";

const ServicesSection = () => {
  const services = [
    {
      icon: BookOpen,
      title: "Educational Resources",
      description: "Comprehensive guides, video tutorials, and market analysis to help you master option trading strategies.",
      features: ["Weekly Market Analysis", "Strategy Guides", "Risk Management", "Video Library"],
      color: "primary"
    },
    {
      icon: Users,
      title: "Community Fellowship", 
      description: "Connect with like-minded traders, share insights, and learn from experienced professionals in our exclusive community.",
      features: ["Private Discord", "Weekly Meetups", "Peer Learning", "Success Stories"],
      color: "accent"
    },
    {
      icon: TrendingUp,
      title: "Live Trading Signals",
      description: "Receive real-time trading alerts and signals from our expert analysts with detailed entry and exit strategies.",
      features: ["Real-time Alerts", "Entry/Exit Points", "Risk Analysis", "Performance Tracking"],
      color: "success"
    },
    {
      icon: Shield,
      title: "Risk Management",
      description: "Learn proven risk management techniques to protect your capital and maximize long-term profitability.",
      features: ["Position Sizing", "Stop Loss Strategies", "Portfolio Diversification", "Capital Protection"],
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
            Our <span className="bg-gradient-accent bg-clip-text text-transparent">Services</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Everything you need to succeed in stock option trading, backed by our fellowship community and proven strategies.
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
            Ready to Transform Your Trading?
          </h3>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of successful traders who have achieved consistent profits through our proven fellowship approach.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg">
              Start Free Trial
            </Button>
            <Button variant="outline" size="lg">
              <MessageCircle className="w-5 h-5 mr-2" />
              Schedule Consultation
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;