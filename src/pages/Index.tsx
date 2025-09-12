import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import DailyScripture from "@/components/DailyScripture";
import ServicesSection from "@/components/ServicesSection";
import AboutSection from "@/components/AboutSection";
import ContactSection from "@/components/ContactSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <HeroSection />
      <DailyScripture />
      <ServicesSection />
      <AboutSection />
      <ContactSection />
      
      {/* Footer */}
      <footer className="bg-background border-t border-border py-8">
        <div className="container mx-auto px-6 text-center">
          <p className="text-muted-foreground">
            © 2024 Koinonia. All rights reserved. | Fellowship that guides finance.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;