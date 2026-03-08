import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { User, Shield, TrendingUp, BookOpen, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";

interface OnboardingWizardProps {
  userId: string;
  onComplete: () => void;
}

const STEPS = [
  { id: "profile", title: "Your Profile", icon: User },
  { id: "risk", title: "Risk Preferences", icon: Shield },
  { id: "mode", title: "Trading Mode", icon: TrendingUp },
  { id: "tutorial", title: "Quick Tour", icon: BookOpen },
];

export const OnboardingWizard = ({ userId, onComplete }: OnboardingWizardProps) => {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [experience, setExperience] = useState("");
  const [riskTolerance, setRiskTolerance] = useState("moderate");
  const [maxDailyLoss, setMaxDailyLoss] = useState("500");
  const [maxPositionSize, setMaxPositionSize] = useState("1000");
  const [tradingMode, setTradingMode] = useState("paper");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          trading_experience: experience,
        })
        .eq("user_id", userId);
      setStep(1);
    } catch (error) {
      toast({ title: "Error saving profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRisk = async () => {
    setSaving(true);
    try {
      await supabase
        .from("auto_trading_settings")
        .upsert({
          user_id: userId,
          risk_tolerance: riskTolerance,
          max_daily_loss: parseFloat(maxDailyLoss),
          max_position_size: parseFloat(maxPositionSize),
        }, { onConflict: "user_id" });
      setStep(2);
    } catch (error) {
      toast({ title: "Error saving risk preferences", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMode = async () => {
    setSaving(true);
    try {
      await supabase
        .from("user_api_credentials")
        .upsert({
          user_id: userId,
          trading_mode: tradingMode,
        }, { onConflict: "user_id" });
      setStep(3);
    } catch (error) {
      toast({ title: "Error saving trading mode", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    localStorage.setItem("onboarding_complete", "true");
    toast({ title: "Welcome aboard! 🎉", description: "Your account is set up and ready to go." });
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 mb-4">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center gap-1 text-xs font-medium ${
                  i <= step ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                  i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary/20 text-primary border border-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${i < step ? "bg-primary" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-1" />
          <CardTitle className="flex items-center gap-2 mt-4">
            {(() => { const Icon = STEPS[step].icon; return <Icon className="w-5 h-5 text-primary" />; })()}
            {STEPS[step].title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label>Trading Experience</Label>
                <div className="grid grid-cols-3 gap-2">
                  {["beginner", "intermediate", "advanced"].map((level) => (
                    <Button
                      key={level}
                      variant={experience === level ? "default" : "outline"}
                      size="sm"
                      onClick={() => setExperience(level)}
                      className="capitalize"
                    >
                      {level}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={handleSaveProfile} disabled={saving || !fullName} className="w-full">
                Continue <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Risk Tolerance</Label>
                <div className="grid grid-cols-3 gap-2">
                  {["conservative", "moderate", "aggressive"].map((level) => (
                    <Button
                      key={level}
                      variant={riskTolerance === level ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRiskTolerance(level)}
                      className="capitalize"
                    >
                      {level}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Max Daily Loss ($)</Label>
                <Input type="number" value={maxDailyLoss} onChange={(e) => setMaxDailyLoss(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Position Size ($)</Label>
                <Input type="number" value={maxPositionSize} onChange={(e) => setMaxPositionSize(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSaveRisk} disabled={saving} className="flex-1">
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Choose how you'd like to start. You can always change this later in Settings.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTradingMode("paper")}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    tradingMode === "paper" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="text-2xl mb-2">📝</div>
                  <h4 className="font-semibold text-sm">Paper Trading</h4>
                  <p className="text-xs text-muted-foreground mt-1">Practice with virtual money — no risk</p>
                </button>
                <button
                  onClick={() => setTradingMode("live")}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    tradingMode === "live" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="text-2xl mb-2">🔴</div>
                  <h4 className="font-semibold text-sm">Live Trading</h4>
                  <p className="text-xs text-muted-foreground mt-1">Connect your brokerage account</p>
                </button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSaveMode} disabled={saving} className="flex-1">
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <TrendingUp className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold">Trading Dashboard</h4>
                    <p className="text-xs text-muted-foreground">Place orders, view charts, and manage positions from the Trading page.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Shield className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold">Risk Management</h4>
                    <p className="text-xs text-muted-foreground">Daily loss guards, position sizing, and portfolio Greeks are built in.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <BookOpen className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold">Education & Academy</h4>
                    <p className="text-xs text-muted-foreground">Structured courses and lessons to improve your trading knowledge.</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">
                ⚠️ This platform provides educational tools and market analysis technology. It does not provide investment advice. All trading decisions are made solely by you.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleComplete} className="flex-1">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Get Started
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
