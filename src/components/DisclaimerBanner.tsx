const DisclaimerBanner = () => {
  return (
    <div className="bg-muted/50 border-t border-border py-3">
      <div className="container mx-auto px-6">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          <strong>Important Disclaimer:</strong> Koinonia is an educational software tool — not a registered investment advisor, 
          broker-dealer, or financial planner. All content, AI analyses, and study scenarios are for educational purposes only 
          and do not constitute investment advice. Trading involves substantial risk of loss. Past performance does not guarantee 
          future results. All trading decisions are made solely by the user. Please consult a qualified financial advisor before 
          making investment decisions.
        </p>
      </div>
    </div>
  );
};

export default DisclaimerBanner;
