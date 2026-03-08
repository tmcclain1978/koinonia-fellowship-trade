import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, TrendingUp, LogOut, User, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConnectionHealthIndicator } from "@/components/ConnectionHealthIndicator";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { SystemStatusBanner } from "@/components/SystemStatusBanner";

const scrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const Navigation = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleSectionClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    if (location.pathname !== '/') {
      navigate('/');
      // Wait for navigation to complete, then scroll
      setTimeout(() => scrollToSection(sectionId), 100);
    } else {
      scrollToSection(sectionId);
    }
    setIsMenuOpen(false);
  };

  // Don't show navigation on auth page
  if (location.pathname === "/auth") {
    return null;
  }

  // Show authenticated navigation if user is logged in
  if (user) {
    return (
      <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b border-border overflow-hidden">
        <div className="max-w-full px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-accent rounded-full flex items-center justify-center shadow-glow">
                <TrendingUp className="w-6 h-6 text-accent-foreground" />
              </div>
              <div>
                <h1 className="font-display font-bold text-lg text-foreground">Koinonia</h1>
              </div>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden lg:flex items-center gap-3 xl:gap-4 flex-1 justify-end overflow-hidden">
              <Link
                to="/dashboard" 
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/dashboard" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Dashboard
              </Link>
              <Link 
                to="/trading" 
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/trading" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Trading
              </Link>
              <Link 
                to="/paper-trading" 
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/paper-trading" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Paper Trading
              </Link>
              <Link 
                to="/bot-testing" 
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/bot-testing" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Bot Testing
              </Link>
              <Link 
                to="/penny-stocks" 
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/penny-stocks" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Penny Stocks
              </Link>
              <Link 
                to="/pocketoption" 
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/pocketoption" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                PocketOption
              </Link>
              <Link 
                to="/analytics"
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/analytics" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Analytics
              </Link>
              <Link 
                to="/trading-journal"
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/trading-journal" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Journal
              </Link>
              <Link 
                to="/advanced-analytics"
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/advanced-analytics" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Adv. Analytics
              </Link>
              <Link 
                to="/academy"
                className={`text-sm font-medium transition-colors ${
                  location.pathname.startsWith("/academy") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Academy
              </Link>
              <Link 
                to="/education"
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/education" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Education
              </Link>
              <Link 
                to="/podcast" 
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/podcast" 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Podcast
              </Link>
              
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border shrink-0">
                <ConnectionHealthIndicator />
                <NotificationCenter />
                <Button variant="ghost" size="sm" asChild className="px-2">
                  <Link to="/settings">
                    <Settings className="w-4 h-4" />
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSignOut} className="px-2">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden text-foreground"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {isMenuOpen && (
            <div className="lg:hidden mt-4 py-4 border-t border-border">
              <div className="flex flex-col space-y-4">
                <Link 
                  to="/dashboard" 
                  className={`text-sm font-medium ${
                    location.pathname === "/dashboard" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link 
                  to="/trading" 
                  className={`text-sm font-medium ${
                    location.pathname === "/trading" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Trading
                </Link>
                <Link 
                  to="/paper-trading" 
                  className={`text-sm font-medium ${
                    location.pathname === "/paper-trading" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Paper Trading
                </Link>
                <Link 
                  to="/bot-testing" 
                  className={`text-sm font-medium ${
                    location.pathname === "/bot-testing" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Bot Testing
                </Link>
                <Link 
                  to="/penny-stocks" 
                  className={`text-sm font-medium ${
                    location.pathname === "/penny-stocks" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Penny Stocks
                </Link>
                <Link 
                  to="/pocketoption" 
                  className={`text-sm font-medium ${
                    location.pathname === "/pocketoption" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  PocketOption
                </Link>
                <Link 
                  to="/analytics"
                  className={`text-sm font-medium ${
                    location.pathname === "/analytics" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Analytics
                </Link>
                <Link 
                  to="/trading-journal"
                  className={`text-sm font-medium ${
                    location.pathname === "/trading-journal" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Journal
                </Link>
                <Link 
                  to="/academy"
                  className={`text-sm font-medium ${
                    location.pathname.startsWith("/academy") 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Academy
                </Link>
                <Link 
                  to="/education"
                  className={`text-sm font-medium ${
                    location.pathname === "/education" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Education
                </Link>
                <Link 
                  to="/podcast" 
                  className={`text-sm font-medium ${
                    location.pathname === "/podcast" 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Podcast
                </Link>
                
                <div className="pt-4 border-t border-border space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-4 h-4" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    asChild
                    className="w-full justify-start"
                  >
                    <Link to="/settings" onClick={() => setIsMenuOpen(false)}>
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Link>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleSignOut}
                    className="w-full justify-start"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
      <SystemStatusBanner />
      </>
    );
  }

  // Show public navigation
  return (
    <nav className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-accent rounded-full flex items-center justify-center shadow-glow">
              <TrendingUp className="w-6 h-6 text-accent-foreground" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-foreground">Koinonia</h1>
              <p className="text-xs text-muted-foreground">Fellowship that guides finance</p>
            </div>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <a 
              href="#home" 
              onClick={(e) => handleSectionClick(e, 'home')}
              className="text-foreground hover:text-primary transition-colors cursor-pointer"
            >
              Home
            </a>
            <a 
              href="#services" 
              onClick={(e) => handleSectionClick(e, 'services')}
              className="text-foreground hover:text-primary transition-colors cursor-pointer"
            >
              Services
            </a>
            <Link to="/pricing" className="text-foreground hover:text-primary transition-colors">
              Pricing
            </Link>
            <a 
              href="#about" 
              onClick={(e) => handleSectionClick(e, 'about')}
              className="text-foreground hover:text-primary transition-colors cursor-pointer"
            >
              About
            </a>
            <a 
              href="#contact" 
              onClick={(e) => handleSectionClick(e, 'contact')}
              className="text-foreground hover:text-primary transition-colors cursor-pointer"
            >
              Contact
            </a>
            <Button variant="hero" size="sm" asChild>
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 py-4 border-t border-border">
            <div className="flex flex-col space-y-4">
              <a 
                href="#home" 
                onClick={(e) => handleSectionClick(e, 'home')}
                className="text-foreground hover:text-primary transition-colors cursor-pointer"
              >
                Home
              </a>
              <a 
                href="#services" 
                onClick={(e) => handleSectionClick(e, 'services')}
                className="text-foreground hover:text-primary transition-colors cursor-pointer"
              >
                Services
              </a>
              <Link 
                to="/pricing" 
                onClick={() => setIsMenuOpen(false)}
                className="text-foreground hover:text-primary transition-colors"
              >
                Pricing
              </Link>
              <a 
                href="#about" 
                onClick={(e) => handleSectionClick(e, 'about')}
                className="text-foreground hover:text-primary transition-colors cursor-pointer"
              >
                About
              </a>
              <a 
                href="#contact" 
                onClick={(e) => handleSectionClick(e, 'contact')}
                className="text-foreground hover:text-primary transition-colors cursor-pointer"
              >
                Contact
              </a>
              <Button variant="hero" size="sm" className="self-start" asChild>
                <Link to="/auth">Get Started</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;