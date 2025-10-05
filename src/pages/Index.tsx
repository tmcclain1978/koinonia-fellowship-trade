import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import DailyScripture from "@/components/DailyScripture";
import ServicesSection from "@/components/ServicesSection";
import AboutSection from "@/components/AboutSection";
import ContactSection from "@/components/ContactSection";
import { PrivacyPolicyModal } from "@/components/PrivacyPolicyModal";

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
        <div className="container mx-auto px-6 text-center space-y-2">
          <div className="flex items-center justify-center gap-4 text-sm">
            <PrivacyPolicyModal />
          </div>
          <p className="text-muted-foreground text-sm">
            © 2024 Koinonia. All rights reserved. | Fellowship that guides finance.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;