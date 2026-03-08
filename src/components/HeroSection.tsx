import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, BookOpen, BarChart2, Shield } from "lucide-react";
import heroImage from "@/assets/hero-trading.jpg";
import DemoVideoModal from "@/components/DemoVideoModal";

const HeroSection = () => {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const navigate = useNavigate();

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
                An educational trading software platform. Learn stock and options trading strategies, 
                practice with paper trading tools, and sharpen your skills through community fellowship.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                variant="hero" 
                size="lg" 
                className="group"
                onClick={() => navigate("/auth")}
              >
                Start Learning Today
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

            <p className="text-xs text-muted-foreground max-w-md">
              Koinonia is an educational software tool. It is not a registered investment advisor, broker-dealer, 
              or financial planner. All content is for educational and informational purposes only.
            </p>
          </div>

          {/* Right Content - Platform Features Card */}
          <div className="relative">
            <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-elegant border border-border">
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="font-display font-semibold text-xl text-card-foreground mb-2">
                    Educational Trading Tools
                  </h3>
                  <p className="text-muted-foreground text-sm">Software tools to support your learning journey</p>
                </div>
                
                {/* Platform Features */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <div>
                      <span className="text-sm font-medium text-card-foreground">300+ Lessons & Courses</span>
                      <p className="text-xs text-muted-foreground">From beginner to advanced strategies</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg">
                    <BarChart2 className="w-5 h-5 text-success" />
                    <div>
                      <span className="text-sm font-medium text-card-foreground">Paper Trading Simulator</span>
                      <p className="text-xs text-muted-foreground">Practice risk-free with simulated trades</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-accent/10 rounded-lg">
                    <Shield className="w-5 h-5 text-accent" />
                    <div>
                      <span className="text-sm font-medium text-card-foreground">Risk Management Education</span>
                      <p className="text-xs text-muted-foreground">Learn position sizing & capital protection</p>
                    </div>
                  </div>
                </div>

                <div className="text-center pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground italic">
                    For educational purposes only. Past performance does not guarantee future results.
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
