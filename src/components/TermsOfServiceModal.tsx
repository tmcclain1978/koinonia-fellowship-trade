import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export const TermsOfServiceModal = ({ trigger }: { trigger?: React.ReactNode }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || <Button variant="link" className="text-primary">Terms of Service</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Terms of Service</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-semibold text-base mb-2">1. Nature of Service</h3>
              <p className="text-muted-foreground">
                Koinonia ("the Platform") is an <strong>educational software tool</strong> that provides trading education, 
                market analysis tools, paper trading simulators, and related educational content. The Platform is 
                <strong> not</strong> a registered investment advisor (RIA), broker-dealer, financial planner, or 
                fiduciary. We do not manage client portfolios or provide personalized investment advice.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">2. No Investment Advice</h3>
              <p className="text-muted-foreground">
                All content, tools, AI-generated analyses, study scenarios, market data visualizations, and educational 
                materials provided through the Platform are for <strong>educational and informational purposes only</strong>. 
                Nothing on this Platform constitutes:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li>A recommendation or solicitation to buy, sell, or hold any security</li>
                <li>Personalized investment advice or financial planning</li>
                <li>An offer to manage or trade securities on your behalf</li>
                <li>A guarantee of future trading performance or returns</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">3. User-Directed Trading</h3>
              <p className="text-muted-foreground">
                If you choose to connect your brokerage account to the Platform for the purpose of executing trades, 
                you acknowledge and agree that:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li>All trading decisions are made solely by you, the user</li>
                <li>Koinonia does not direct, recommend, or execute trades on your behalf</li>
                <li>The Platform acts as a software interface — it passes your instructions to your brokerage</li>
                <li>You are solely responsible for the outcomes of any trades you place</li>
                <li>Brokerage connectivity is provided as a convenience feature of the software tool</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">4. AI-Generated Content Disclaimer</h3>
              <p className="text-muted-foreground">
                The Platform uses artificial intelligence to generate educational analysis, hypothetical scenarios, 
                and study materials. AI-generated content:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li>May contain errors, inaccuracies, or outdated information</li>
                <li>Should not be relied upon as the sole basis for any trading decision</li>
                <li>Is not a substitute for professional financial advice</li>
                <li>Represents hypothetical analysis, not guaranteed outcomes</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">5. Paper Trading & Simulation</h3>
              <p className="text-muted-foreground">
                Paper trading and backtesting features use simulated environments. Results from simulated trading 
                <strong> do not</strong> represent actual trading and <strong>do not guarantee</strong> future results 
                in live markets. Simulated trading does not account for real-world factors including but not limited to 
                market liquidity, slippage, emotional decision-making, and execution delays.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">6. Risk Disclosure</h3>
              <p className="text-muted-foreground font-medium">
                Trading stocks and options involves substantial risk of loss and is not suitable for all investors. 
                You could lose some or all of your invested capital. Past performance is not indicative of future results.
              </p>
              <p className="text-muted-foreground mt-2">
                Options trading involves additional risks including the potential for total loss of premium paid. 
                Before trading options, you should read the Characteristics and Risks of Standardized Options 
                available from your broker or from the Options Clearing Corporation (OCC).
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">7. No Fiduciary Relationship</h3>
              <p className="text-muted-foreground">
                Your use of the Platform does not create a fiduciary, advisory, or broker-dealer relationship 
                between you and Koinonia. We owe you no duty of loyalty, care, or best execution. You should 
                consult with a qualified, licensed financial advisor before making investment decisions.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">8. Third-Party Services</h3>
              <p className="text-muted-foreground">
                The Platform may integrate with third-party brokerage services, data providers, and payment 
                processors. Koinonia is not responsible for the services, actions, or policies of third parties. 
                Your use of third-party services is governed by their respective terms and agreements.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">9. Limitation of Liability</h3>
              <p className="text-muted-foreground">
                To the maximum extent permitted by law, Koinonia shall not be liable for any direct, indirect, 
                incidental, special, consequential, or punitive damages arising from your use of the Platform, 
                including but not limited to financial losses from trading decisions made after using our 
                educational tools.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">10. Age Requirement</h3>
              <p className="text-muted-foreground">
                You must be at least 18 years of age and a legal resident of your jurisdiction to use this Platform. 
                Users who access brokerage connectivity features must meet all requirements set by their brokerage firm.
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
