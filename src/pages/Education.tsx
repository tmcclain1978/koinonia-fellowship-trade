import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Play, BookOpen, LogOut } from "lucide-react";
import Navigation from "@/components/Navigation";

const Education = () => {
  const [selectedVideo, setSelectedVideo] = useState(0);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, [navigate]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    fetchVideos();
  };

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from("videos" as any)
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      setVideos((data as any) || []);
    } catch (error) {
      console.error("Error fetching videos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 80px)' }}>
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading videos...</p>
          </div>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 80px)' }}>
          <p className="text-muted-foreground">No videos available yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-6 py-24">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold mb-2">Education Hub</h1>
          <p className="text-muted-foreground">
            Learn the fundamentals of options trading with our curated video library
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Video Player */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-xl overflow-hidden border border-border">
              <div className="aspect-video bg-black">
                <iframe
                  width="100%"
                  height="100%"
                  src={videos[selectedVideo].video_url}
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
                      src={video.thumbnail_url} 
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