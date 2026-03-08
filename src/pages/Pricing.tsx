import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Sparkles, Zap, Crown, ArrowRight, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";

const tiers = [
  {
    name: "Free with Promo Code",
    id: "free_user",
    price: "$0",
    description: "Perfect for getting started",
    icon: Sparkles,
    features: [
      "Access to educational videos",
      "Weekly podcast episodes",
      "Basic market study tools",
      "Community forum access",
    ],
    cta: "Get Started",
    needsPromo: true,
  },
  {
    name: "Basic",
    id: "basic",
    price: "$49",
    period: "/month",
    description: "For active learners",
    icon: Zap,
    features: [
      "Everything in Free",
      "Up to 50 AI educational analyses per month",
      "5 daily AI study scenarios",
      "Basic options chain data viewer",
      "Email support",
    ],
    cta: "Subscribe Now",
  },
  {
    name: "Pro",
    id: "pro",
    price: "$149",
    period: "/month",
    description: "For dedicated students",
    icon: TrendingUp,
    popular: true,
    features: [
      "Everything in Basic",
      "Unlimited AI educational analyses",
      "Unlimited AI study scenarios",
      "Advanced options data with Greeks",
      "Priority support",
      "Custom watchlists",
    ],
    cta: "Subscribe Now",
  },
  {
    name: "Enterprise",
    id: "enterprise",
    price: "$499",
    period: "/month",
    description: "For power users & teams",
    icon: Crown,
    features: [
      "Everything in Pro",
      "AI-powered strategy backtesting lab",
      "Advanced simulation engine",
      "Full risk analysis toolkit",
      "API access",
      "Dedicated support representative",
      "White-glove onboarding",
    ],
    cta: "Subscribe Now",
  },
];

const Pricing = () => {
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubscribe = async (tierId: string, needsPromo: boolean) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      if (needsPromo && !promoCode) {
        toast({
          title: "Promo Code Required",
          description: "Please enter a promo code to activate your free account.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (needsPromo) {
        // Validate and redeem promo code
        const { data, error } = await supabase.functions.invoke("redeem-promo-code", {
          body: { code: promoCode, userId: session.user.id },
        });

        if (error || data.error) {
          throw new Error(data?.error || "Invalid promo code");
        }

        toast({
          title: "Success!",
          description: "Your free account has been activated.",
        });
        navigate("/dashboard");
      } else {
        // Create Stripe checkout session
        const { data, error } = await supabase.functions.invoke("create-checkout-session", {
          body: { 
            tier: tierId,
            userId: session.user.id,
          },
        });

        if (error || data.error) {
          throw new Error(data?.error || "Failed to create checkout session");
        }

        // Redirect to Stripe checkout
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-20">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
            Choose Your Learning Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Select the plan that fits your educational journey. All plans provide software tools 
            for learning — not investment advice.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {tiers.map((tier) => {
            const Icon = tier.icon;
            return (
              <div
                key={tier.id}
                className={`relative bg-gradient-card rounded-2xl p-8 border ${
                  tier.popular
                    ? "border-primary shadow-xl scale-105"
                    : "border-border"
                } transition-all hover:border-primary/50`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold text-foreground">
                      {tier.name}
                    </h3>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                    {tier.period && (
                      <span className="text-muted-foreground">{tier.period}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{tier.description}</p>
                </div>

                {tier.needsPromo && (
                  <div className="mb-6">
                    <Input
                      placeholder="Enter promo code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      className="w-full"
                    />
                  </div>
                )}

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSubscribe(tier.id, tier.needsPromo || false)}
                  disabled={loading}
                  variant={tier.popular ? "default" : "outline"}
                  className="w-full"
                >
                  {tier.cta}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* FAQ or Additional Info */}
        <div className="mt-20 text-center space-y-4">
          <p className="text-muted-foreground">
            All plans include a 30-day money-back guarantee
          </p>
          <p className="text-sm text-muted-foreground">
            Need a custom plan? <a href="/#contact" className="text-primary hover:underline">Contact us</a>
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto mt-6 pt-4 border-t border-border italic">
            Koinonia is an educational software platform. Subscription fees are for access to educational tools, 
            courses, and software features. We do not manage portfolios, provide investment advice, or guarantee 
            trading results. All trading decisions are made solely by the user.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Pricing;