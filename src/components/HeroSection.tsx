import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, TrendingUp, Users, Shield } from "lucide-react";
import heroImage from "@/assets/hero-trading.jpg";
import DemoVideoModal from "@/components/DemoVideoModal";

const HeroSection = () => {
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  return (
    <section id="home" className="relative min-h-screen flex items-center pt-20 bg-gradient-hero">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-background/60" />
      
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="font-display text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground leading-tight">
                <span className="bg-gradient-accent bg-clip-text text-transparent">Fellowship</span>
                <br />
                that guides
                <br />
                <span className="text-primary-glow">finance</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg leading-relaxed">
                Join our community of successful stock option traders. Learn proven strategies, 
                receive expert guidance, and build lasting wealth through fellowship.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="hero" size="lg" className="group">
                Start Trading Today
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                variant="ghost" 
                size="lg" 
                className="group"
                onClick={() => setIsDemoOpen(true)}
              >
                <Play className="w-5 h-5 mr-2" />
                Watch Demo
              </Button>
            </div>

            {/* Stats */}
            <div className="flex flex-col sm:flex-row gap-8 pt-8 border-t border-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-display font-semibold text-2xl text-foreground">85%</div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <div className="font-display font-semibold text-2xl text-foreground">2,500+</div>
                  <div className="text-sm text-muted-foreground">Active Members</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                  <Shield className="w-6 h-6 text-success" />
                </div>
                <div>
                  <div className="font-display font-semibold text-2xl text-foreground">5 Years</div>
                  <div className="text-sm text-muted-foreground">Proven Track Record</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Content - Interactive Card */}
          <div className="relative">
            <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-elegant border border-border">
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="font-display font-semibold text-xl text-card-foreground mb-2">
                    Live Trading Performance
                  </h3>
                  <p className="text-muted-foreground text-sm">Real-time results from our community</p>
                </div>
                
                {/* Mock Trading Data */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-success/10 rounded-lg">
                    <span className="text-sm font-medium text-card-foreground">AAPL Call Option</span>
                    <span className="text-success font-semibold">+24.5%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                    <span className="text-sm font-medium text-card-foreground">TSLA Put Option</span>
                    <span className="text-primary font-semibold">+18.2%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-accent/10 rounded-lg">
                    <span className="text-sm font-medium text-card-foreground">MSFT Call Option</span>
                    <span className="text-accent font-semibold">+31.7%</span>
                  </div>
                </div>

                <div className="text-center pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Average monthly return: <span className="text-primary font-semibold">+22.8%</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Video Modal */}
      <DemoVideoModal 
        isOpen={isDemoOpen} 
        onClose={() => setIsDemoOpen(false)} 
      />
    </section>
  );
};

export default HeroSection;