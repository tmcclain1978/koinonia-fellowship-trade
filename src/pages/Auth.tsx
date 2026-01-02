import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";
import { PrivacyPolicyModal } from "@/components/PrivacyPolicyModal";
import { Label } from "@/components/ui/label";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(false); // Default to signup for new users
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationStep, setVerificationStep] = useState<'signup' | 'identity' | 'complete'>('signup');
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Check if user is a family member and link them
        setTimeout(async () => {
          try {
            await supabase.functions.invoke('link-family-member', {
              body: { userId: session.user.id, email: session.user.email }
            });
          } catch (err) {
            console.log('Family link check:', err);
          }
        }, 0);
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Age verification for signup
      if (!isLogin) {
        if (!dateOfBirth) {
          toast({
            title: "Date of Birth Required",
            description: "Please enter your date of birth.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const age = calculateAge(dateOfBirth);
        if (age < 18) {
          toast({
            title: "Age Requirement Not Met",
            description: "You must be at least 18 years old to create an account.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast({
          title: "Welcome back!",
          description: "You've successfully logged in.",
        });
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: fullName,
              date_of_birth: dateOfBirth,
            },
          },
        });

        if (signUpError) throw signUpError;

        toast({
          title: "Account created!",
          description: "Now let's verify your identity with Stripe.",
        });

        // Get current user
        const { data: { user: newUser } } = await supabase.auth.getUser();
        
        if (newUser) {
          // Create Stripe Identity verification session
          const { data: stripeData, error: stripeError } = await supabase.functions.invoke(
            'create-stripe-identity-session',
            {
              body: {
                userId: newUser.id,
                returnUrl: `${window.location.origin}/dashboard`,
              },
            }
          );

          if (stripeError || !stripeData?.url) {
            console.error('Stripe verification error:', stripeError);
            toast({
              title: "Verification Setup Failed",
              description: "Please contact support to complete identity verification.",
              variant: "destructive",
            });
            return;
          }

          setVerificationUrl(stripeData.url);
          setVerificationStep('identity');
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      
      let errorMessage = error.message;
      
      // Provide helpful error messages
      if (error.message?.includes("Invalid login credentials")) {
        errorMessage = isLogin 
          ? "Invalid email or password. Don't have an account? Click 'Sign up' below."
          : "This email is already registered. Click 'Sign in' below to login.";
      }
      
      toast({
        title: isLogin ? "Login Failed" : "Signup Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Render identity verification step
  if (verificationStep === 'identity' && verificationUrl) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl p-8 shadow-elegant border border-border text-center">
            <div className="inline-block p-4 bg-primary/10 rounded-full mb-6">
              <Shield className="w-12 h-12 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold text-foreground mb-4">
              Identity Verification
            </h1>
            <p className="text-muted-foreground mb-6">
              To comply with trading regulations, we need to verify your identity. 
              This process is secure and powered by Stripe Identity.
            </p>
            <div className="space-y-4">
              <Button
                onClick={() => window.location.href = verificationUrl}
                variant="hero"
                size="lg"
                className="w-full"
              >
                Start Verification
              </Button>
              <p className="text-xs text-muted-foreground">
                You'll be redirected to Stripe's secure verification page. 
                Have a government-issued ID ready (driver's license, passport, or state ID).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl p-8 shadow-elegant border border-border">
          <div className="text-center mb-8">
            <div className={`inline-block px-4 py-1 rounded-full mb-4 text-xs font-medium ${
              isLogin ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'
            }`}>
              {isLogin ? '🔑 Login Mode' : '✨ Sign Up Mode'}
            </div>
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              {isLogin ? "Welcome Back" : "Join Koinonia"}
            </h1>
            <p className="text-muted-foreground">
              {isLogin
                ? "Sign in to access your trading dashboard"
                : "Create your account to start trading"}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <Label htmlFor="fullName" className="text-card-foreground">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="dob" className="text-card-foreground">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    required
                    max={new Date().toISOString().split('T')[0]}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    You must be 18 or older to create an account
                  </p>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="email" className="text-card-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-card-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            {!isLogin && (
              <div className="text-xs text-muted-foreground border border-border rounded-lg p-3 bg-muted/30">
                <p className="font-medium mb-1">🔒 Your Privacy Matters</p>
                <p>
                  Your ID and personal information are encrypted and never shared. 
                  Read our <PrivacyPolicyModal trigger={<span className="text-primary cursor-pointer underline">Privacy Policy</span>} />
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isLogin ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                <>{isLogin ? "Sign In" : "Create Account"}</>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                // Clear form when switching modes
                setEmail("");
                setPassword("");
                setFullName("");
                setDateOfBirth("");
              }}
              className="text-primary hover:text-primary-glow transition-colors font-medium"
            >
              {isLogin
                ? "Don't have an account? Sign up →"
                : "Already have an account? Sign in →"}
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground"
          >
            ← Back to home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;