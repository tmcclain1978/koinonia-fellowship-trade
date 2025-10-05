import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Radio, LogOut, Play } from "lucide-react";
import Navigation from "@/components/Navigation";

const Podcast = () => {
  const navigate = useNavigate();

  const episodes = [
    {
      title: "Market Analysis: Tech Stocks Surge",
      date: "Oct 4, 2025",
      duration: "45:20",
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
    {
      title: "Options Strategy Deep Dive",
      date: "Oct 3, 2025",
      duration: "52:15",
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
    {
      title: "Trading Psychology and Discipline",
      date: "Oct 2, 2025",
      duration: "38:45",
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
  ];

  const [currentEpisode, setCurrentEpisode] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Live Stream */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-xl overflow-hidden border border-border">
              <div className="aspect-video bg-black">
                <iframe
                  width="100%"
                  height="100%"
                  src={episodes[currentEpisode].url}
                  title="Koinonia Live Podcast"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-destructive/10 border border-destructive/20 rounded-full">
                    <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
                    <span className="text-xs text-destructive font-medium">LIVE NOW</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{episodes[currentEpisode].duration}</span>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {episodes[currentEpisode].title}
                </h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Join us for live market analysis, trading strategies, and Q&A with the Koinonia community.
                </p>
                <div className="flex gap-3">
                  <Button variant="hero">
                    <Play className="w-4 h-4 mr-2" />
                    Watch Live
                  </Button>
                  <Button variant="outline">Chat</Button>
                </div>
              </div>
            </div>

            {/* Live Chat Preview */}
            <div className="mt-6 bg-card rounded-xl p-6 border border-border">
              <h3 className="font-semibold text-foreground mb-4">Live Chat</h3>
              <div className="space-y-3 h-40 overflow-y-auto text-sm">
                <div className="flex gap-2">
                  <span className="font-semibold text-primary">Trader123:</span>
                  <span className="text-muted-foreground">Great analysis on AAPL!</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-accent">OptionsKing:</span>
                  <span className="text-muted-foreground">What's your take on tech sector?</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-success">MarketWatch:</span>
                  <span className="text-muted-foreground">Thanks for the insights!</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                />
                <Button>Send</Button>
              </div>
            </div>
          </div>

          {/* Episode List */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Recent Episodes</h3>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {episodes.map((episode, index) => (
                <div
                  key={index}
                  onClick={() => setCurrentEpisode(index)}
                  className={`p-4 cursor-pointer transition-colors border-t border-border ${
                    currentEpisode === index
                      ? 'bg-primary/10'
                      : 'hover:bg-card-hover'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-sm text-foreground pr-2">
                      {episode.title}
                    </h4>
                    {index === 0 && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-destructive/10 rounded-full flex-shrink-0">
                        <div className="w-1.5 h-1.5 bg-destructive rounded-full"></div>
                        <span className="text-[10px] text-destructive font-medium">LIVE</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{episode.date}</span>
                    <span>•</span>
                    <span>{episode.duration}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 border-t border-border">
              <Button variant="outline" className="w-full">
                View All Episodes
              </Button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

export default Podcast;