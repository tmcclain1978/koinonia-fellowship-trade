import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Play, BookOpen, LogOut } from "lucide-react";

const Education = () => {
  const [selectedVideo, setSelectedVideo] = useState(0);
  const navigate = useNavigate();

  const videos = [
    {
      title: "Introduction to Options Trading",
      duration: "15:30",
      category: "Basics",
      url: "https://www.youtube.com/embed/VJgHkAqohbE",
      thumbnail: "https://img.youtube.com/vi/VJgHkAqohbE/mqdefault.jpg"
    },
    {
      title: "Understanding Call and Put Options",
      duration: "22:45",
      category: "Strategy",
      url: "https://www.youtube.com/embed/EfmTWu2yn5Q",
      thumbnail: "https://img.youtube.com/vi/EfmTWu2yn5Q/mqdefault.jpg"
    },
    {
      title: "Risk Management in Options Trading",
      duration: "18:20",
      category: "Risk",
      url: "https://www.youtube.com/embed/7PM4rNDr4oI",
      thumbnail: "https://img.youtube.com/vi/7PM4rNDr4oI/mqdefault.jpg"
    },
    {
      title: "Technical Analysis for Options",
      duration: "25:10",
      category: "Analysis",
      url: "https://www.youtube.com/embed/08c8g3wJn90",
      thumbnail: "https://img.youtube.com/vi/08c8g3wJn90/mqdefault.jpg"
    },
    {
      title: "Advanced Options Strategies",
      duration: "30:15",
      category: "Advanced",
      url: "https://www.youtube.com/embed/7xdoQLHx5Y8",
      thumbnail: "https://img.youtube.com/vi/7xdoQLHx5Y8/mqdefault.jpg"
    },
  ];

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 backdrop-blur-sm bg-card/90">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                ← Dashboard
              </Button>
              <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
                <BookOpen className="w-6 h-6" />
                Options Education
              </h1>
            </div>
            <Button variant="ghost" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <p className="text-muted-foreground mb-8">
          Learn the fundamentals of options trading with our curated video library
        </p>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Video Player */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-xl overflow-hidden border border-border">
              <div className="aspect-video bg-black">
                <iframe
                  width="100%"
                  height="100%"
                  src={videos[selectedVideo].url}
                  title={videos[selectedVideo].title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">
                    {videos[selectedVideo].category}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {videos[selectedVideo].duration}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  {videos[selectedVideo].title}
                </h2>
                <p className="text-muted-foreground text-sm">
                  Master the concepts and strategies needed for successful options trading
                </p>
              </div>
            </div>
          </div>

          {/* Video List */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Course Modules</h3>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {videos.map((video, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedVideo(index)}
                  className={`flex gap-3 p-4 cursor-pointer transition-colors border-t border-border ${
                    selectedVideo === index
                      ? 'bg-primary/10'
                      : 'hover:bg-card-hover'
                  }`}
                >
                  <div className="relative w-24 h-16 flex-shrink-0 bg-black rounded-lg overflow-hidden">
                    <img 
                      src={video.thumbnail} 
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-foreground mb-1 truncate">
                      {video.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{video.category}</span>
                      <span>•</span>
                      <span>{video.duration}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Education;