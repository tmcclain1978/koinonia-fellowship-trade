import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import DailyScripture from "@/components/DailyScripture";
import ServicesSection from "@/components/ServicesSection";
import AboutSection from "@/components/AboutSection";
import ContactSection from "@/components/ContactSection";
import { PrivacyPolicyModal } from "@/components/PrivacyPolicyModal";
import { TermsOfServiceModal } from "@/components/TermsOfServiceModal";
import DisclaimerBanner from "@/components/DisclaimerBanner";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <HeroSection />
      <DailyScripture />
      <ServicesSection />
      <AboutSection />
      <ContactSection />
      
      {/* Disclaimer Banner */}
      <DisclaimerBanner />

      {/* Footer */}
      <footer className="bg-background border-t border-border py-8">
        <div className="container mx-auto px-6 text-center space-y-2">
          <div className="flex items-center justify-center gap-4 text-sm">
            <TermsOfServiceModal />
            <span className="text-muted-foreground">|</span>
            <PrivacyPolicyModal />
          </div>
          <p className="text-muted-foreground text-sm">
            © 2026 Koinonia. All rights reserved. | Educational Trading Software Platform
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto">
            Not a registered investment advisor, broker-dealer, or financial planner. 
            For educational purposes only.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
