import { useState, useEffect } from "react";
import { BookOpen, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const DailyScripture = () => {
  const scriptures = [
    {
      verse: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.",
      reference: "Proverbs 3:5-6",
      theme: "Trust & Guidance"
    },
    {
      verse: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, to give you hope and a future.",
      reference: "Jeremiah 29:11",
      theme: "Hope & Future"
    },
    {
      verse: "But seek first his kingdom and his righteousness, and all these things will be given to you as well.",
      reference: "Matthew 6:33",
      theme: "Priorities & Provision"
    },
    {
      verse: "She is more precious than rubies; nothing you desire can compare with her. Length of days is in her right hand; in her left hand are riches and honor.",
      reference: "Proverbs 3:15-16",
      theme: "Wisdom & Wealth"
    },
    {
      verse: "The plans of the diligent lead to profit as surely as haste leads to poverty.",
      reference: "Proverbs 21:5",
      theme: "Diligence & Planning"
    },
    {
      verse: "Commit to the Lord whatever you do, and he will establish your plans.",
      reference: "Proverbs 16:3",
      theme: "Commitment & Success"
    },
    {
      verse: "Honor the Lord with your wealth, with the firstfruits of all your crops; then your barns will be filled to overflowing, and your vats will brim over with new wine.",
      reference: "Proverbs 3:9-10",
      theme: "Stewardship & Blessing"
    }
  ];

  const [currentScripture, setCurrentScripture] = useState(scriptures[0]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Get scripture based on day of year for daily rotation
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const scriptureIndex = dayOfYear % scriptures.length;
    setCurrentScripture(scriptures[scriptureIndex]);
  }, []);

  const refreshScripture = () => {
    setIsRefreshing(true);
    const randomIndex = Math.floor(Math.random() * scriptures.length);
    setTimeout(() => {
      setCurrentScripture(scriptures[randomIndex]);
      setIsRefreshing(false);
    }, 500);
  };

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-6">
              <BookOpen className="w-8 h-8 text-primary" />
              <h2 className="font-display text-4xl lg:text-5xl font-bold text-foreground">
                Daily <span className="bg-gradient-accent bg-clip-text text-transparent">Scripture</span>
              </h2>
            </div>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Start each trading day with divine wisdom and guidance through God's word.
            </p>
          </div>

          {/* Scripture Card */}
          <div className="bg-gradient-card rounded-2xl p-8 lg:p-12 border border-border shadow-elegant">
            <div className="text-center">
              {/* Theme Badge */}
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-8 border border-primary/20">
                <Calendar className="w-4 h-4" />
                {currentScripture.theme}
              </div>

              {/* Scripture Text */}
              <blockquote className="text-2xl lg:text-3xl font-display font-medium text-foreground leading-relaxed mb-8 italic">
                "{currentScripture.verse}"
              </blockquote>

              {/* Reference */}
              <p className="text-xl text-primary font-semibold mb-12">
                — {currentScripture.reference}
              </p>

              {/* Refresh Button */}
              <Button 
                onClick={refreshScripture}
                variant="outline" 
                size="lg"
                disabled={isRefreshing}
                className="group"
              >
                <RefreshCw className={`w-5 h-5 mr-2 transition-transform ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
                {isRefreshing ? 'Loading...' : 'New Scripture'}
              </Button>
            </div>
          </div>

          {/* Fellowship Message */}
          <div className="text-center mt-12">
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              "Fellowship that guides finance" - Let God's wisdom direct your trading decisions and financial stewardship.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DailyScripture;