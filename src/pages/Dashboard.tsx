import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User } from "@supabase/supabase-js";
import { LogOut, TrendingUp, Activity, DollarSign, Settings, Shield, HelpCircle, Bot, BookOpen } from "lucide-react";
import AIAnalysis from "@/components/AIAnalysis";
import TradeSuggestionsCard from "@/components/TradeSuggestionsCard";
import { useSubscription } from "@/hooks/useSubscription";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { subscription } = useSubscription();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        
        // Check account status
        const { data: profileData } = await supabase
          .from("profiles")
          .select("account_status")
          .eq("user_id", session.user.id)
          .single();
        
        if (profileData?.account_status === "pending") {
          navigate("/pending-approval");
          return;
        }
        
        if (profileData?.account_status === "suspended") {
          await supabase.auth.signOut();
          toast({
            title: "Account Suspended",
            description: "Your account has been suspended. Please contact support.",
            variant: "destructive",
          });
          navigate("/auth");
          return;
        }
        
        // Check if user is admin
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .single();
        
        setIsAdmin(roleData?.role === "admin");
      } else {
        navigate("/auth");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You've been successfully signed out.",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-16">
      <div className="container mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">
              Welcome back, {user?.user_metadata?.full_name || user?.email}!
            </h2>
            <p className="text-muted-foreground">
              Access AI-powered trading analysis and real-time market insights.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/help")}>
              <HelpCircle className="mr-2 h-4 w-4" />
              Help
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>
                <Shield className="mr-2 h-4 w-4" />
                Admin
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Quick Access Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {subscription?.tier === "enterprise" && (
            <button 
              onClick={() => navigate("/trading-bot")}
              className="bg-gradient-card rounded-xl p-6 border border-border hover:border-primary/50 transition-all text-left group"
            >
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">AI Trading Bot</h3>
              <p className="text-sm text-muted-foreground">
                Automated trading powered by AI
              </p>
            </button>
          )}
          <button 
            onClick={() => navigate("/trading")}
            className="bg-gradient-card rounded-xl p-6 border border-border hover:border-primary/50 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Trade Options</h3>
            <p className="text-sm text-muted-foreground">
              Place orders and manage your options portfolio
            </p>
          </button>

          <button 
            onClick={() => navigate("/education")}
            className="bg-gradient-card rounded-xl p-6 border border-border hover:border-accent/50 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Activity className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Education Hub</h3>
            <p className="text-sm text-muted-foreground">
              Learn trading strategies and market analysis
            </p>
          </button>

          <button 
            onClick={() => navigate("/podcast")}
            className="bg-gradient-card rounded-xl p-6 border border-border hover:border-success/50 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <DollarSign className="w-6 h-6 text-success" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Live Podcast</h3>
            <p className="text-sm text-muted-foreground">
              Watch live trading discussions and Q&A
            </p>
          </button>

          <button 
            onClick={() => navigate("/paper-trading")}
            className="bg-gradient-card rounded-xl p-6 border border-border hover:border-primary/50 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Paper Trading</h3>
            <p className="text-sm text-muted-foreground">
              Practice trading with virtual money
            </p>
          </button>

          <button 
            onClick={() => navigate("/trading-journal")}
            className="bg-gradient-card rounded-xl p-6 border border-border hover:border-accent/50 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BookOpen className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Trading Journal</h3>
            <p className="text-sm text-muted-foreground">
              Track and analyze your trades with AI
            </p>
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold text-foreground">85%</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Signals</p>
                <p className="text-2xl font-bold text-foreground">12</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monthly Return</p>
                <p className="text-2xl font-bold text-foreground">+22.8%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Suggestions and AI Analysis */}
        <div className="grid lg:grid-cols-2 gap-6">
          <TradeSuggestionsCard />
          <AIAnalysis />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;