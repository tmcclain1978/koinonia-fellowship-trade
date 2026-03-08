import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export const PrivacyPolicyModal = ({ trigger }: { trigger?: React.ReactNode }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || <Button variant="link" className="text-primary">Privacy Policy</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Privacy Policy</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-semibold text-base mb-2">Information We Collect</h3>
              <p className="text-muted-foreground">
                We collect information you provide directly to us, including your name, email address, 
                date of birth, and government-issued identification for age verification purposes.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">How We Use Your Information</h3>
              <p className="text-muted-foreground">
                Your personal information is used solely for:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li>Age verification and account authentication</li>
                <li>Compliance with financial trading regulations</li>
                <li>Providing you with our trading services</li>
                <li>Communicating important account information</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">Identity Verification</h3>
              <p className="text-muted-foreground">
                To comply with federal regulations and ensure you are 18 years or older and a US resident, 
                we require government-issued ID verification. This may include your driver's license, 
                state ID, or passport.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">Data Security & Confidentiality</h3>
              <p className="text-muted-foreground font-medium">
                Your information is kept strictly confidential and will never be shared, sold, or 
                distributed to third parties except as required by law.
              </p>
              <p className="text-muted-foreground mt-2">
                We use industry-standard encryption and security measures to protect your data. 
                All identification documents are encrypted and stored securely using third-party 
                verification services that comply with SOC 2 Type II standards.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">Your Rights</h3>
              <p className="text-muted-foreground">
                You have the right to:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li>Access your personal information</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your account and associated data</li>
                <li>Opt-out of non-essential communications</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">Regulatory Compliance</h3>
              <p className="text-muted-foreground">
                We comply with all applicable financial regulations including SEC, FINRA, and state 
                securities laws. Age verification and identity confirmation are legal requirements 
                for trading platforms.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">Data Retention</h3>
              <p className="text-muted-foreground">
                We retain your information for as long as your account is active or as needed to 
                comply with legal obligations, typically 7 years as required by financial regulations.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">Contact Us</h3>
              <p className="text-muted-foreground">
                If you have any questions about our privacy practices or your personal information, 
                please contact us through our support channels.
              </p>
            </section>

            <p className="text-xs text-muted-foreground mt-6 pt-4 border-t">
              Last Updated: March 2026
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};