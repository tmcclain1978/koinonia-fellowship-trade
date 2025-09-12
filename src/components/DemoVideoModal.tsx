import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Play, X, Volume2, VolumeX, Maximize, RotateCcw } from "lucide-react";

interface DemoVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DemoVideoModal = ({ isOpen, onClose }: DemoVideoModalProps) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Demo trading scenarios data
  const demoSteps = [
    {
      step: 1,
      title: "Market Analysis",
      description: "Identify high-probability option trading opportunities using technical analysis",
      metrics: { winRate: "82%", avgReturn: "+18.5%" }
    },
    {
      step: 2,
      title: "Entry Strategy",
      description: "Execute precise entry points with proper risk management and position sizing",
      metrics: { riskReward: "1:3", maxRisk: "2%" }
    },
    {
      step: 3,
      title: "Profit Taking",
      description: "Strategic exit points to maximize profits while protecting capital",
      metrics: { profitTarget: "+25%", avgTime: "3-7 days" }
    }
  ];

  const handlePlayDemo = () => {
    setIsPlaying(true);
    // Simulate demo progression
    setTimeout(() => setIsPlaying(false), 15000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-display text-2xl font-bold text-foreground">
            Option Trading Demo - Live Strategy
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-6 space-y-6">
          {/* Video Player Area */}
          <div className="relative bg-background-alt rounded-xl overflow-hidden aspect-video">
            {/* Mock Video Interface */}
            <div className="absolute inset-0 bg-gradient-subtle flex flex-col">
              {/* Video Header */}
              <div className="flex justify-between items-center p-4 bg-background/80 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-destructive rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-foreground">LIVE DEMO</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Maximize className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Video Content */}
              <div className="flex-1 flex items-center justify-center">
                {!isPlaying ? (
                  <div className="text-center">
                    <Button
                      variant="hero"
                      size="xl"
                      onClick={handlePlayDemo}
                      className="rounded-full w-20 h-20"
                    >
                      <Play className="w-8 h-8 ml-1" />
                    </Button>
                    <p className="text-muted-foreground mt-4 text-lg">
                      Watch our proven option trading strategy in action
                    </p>
                  </div>
                ) : (
                  <div className="w-full max-w-md space-y-6">
                    {demoSteps.map((step, index) => (
                      <div
                        key={step.step}
                        className={`bg-card/80 backdrop-blur-sm rounded-lg p-4 border border-border transition-all duration-1000 ${
                          index === 0 ? 'opacity-100 scale-100' : 
                          index === 1 ? 'opacity-80 scale-95' : 'opacity-60 scale-90'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold text-sm">
                            {step.step}
                          </div>
                          <h4 className="font-semibold text-card-foreground">{step.title}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                        <div className="flex gap-4 text-xs">
                          {Object.entries(step.metrics).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-1">
                              <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                              <span className="text-primary font-semibold">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar for demo */}
            {isPlaying && (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-background/50">
                <div className="h-full bg-primary animate-pulse w-full origin-left"></div>
              </div>
            )}
          </div>

          {/* Demo Features */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-card rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary mb-1">15min</div>
              <div className="text-sm text-muted-foreground">Demo Duration</div>
            </div>
            <div className="bg-card rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-accent mb-1">$2,450</div>
              <div className="text-sm text-muted-foreground">Potential Profit</div>
            </div>
            <div className="bg-card rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-success mb-1">85%</div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border">
            <Button variant="hero" className="flex-1">
              Start Free Trial - Learn This Strategy
            </Button>
            <Button variant="outline" onClick={handlePlayDemo} disabled={isPlaying}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Replay Demo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemoVideoModal;