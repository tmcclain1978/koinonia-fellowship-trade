import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Send, Loader2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { useToast } from "@/hooks/use-toast";

interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  audio_url: string;
  episode_number: number;
  duration: string;
  episode_type: "live" | "recorded";
  youtube_live_url?: string;
  is_live_now: boolean;
  publish_date: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  created_at: string;
}

const Podcast = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [username, setUsername] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
    fetchEpisodes();
    fetchUsername();
  }, [navigate]);

  useEffect(() => {
    if (episodes.length > 0 && episodes[currentEpisode]) {
      fetchChatMessages();
      subscribeToChat();
    }
  }, [currentEpisode, episodes]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchUsername = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();
      
      setUsername(profile?.full_name || user.email?.split("@")[0] || "Anonymous");
    }
  };

  const fetchEpisodes = async () => {
    try {
      const { data, error } = await supabase
        .from("podcasts")
        .select("*")
        .eq("status", "published")
        .order("publish_date", { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setEpisodes(data as PodcastEpisode[]);
      }
    } catch (error) {
      console.error("Error fetching episodes:", error);
      toast({
        title: "Error",
        description: "Failed to load podcast episodes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchChatMessages = async () => {
    if (!episodes[currentEpisode]) return;
    
    try {
      const { data, error } = await supabase
        .from("podcast_chat_messages")
        .select("*")
        .eq("podcast_id", episodes[currentEpisode].id)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      setChatMessages(data || []);
    } catch (error) {
      console.error("Error fetching chat:", error);
    }
  };

  const subscribeToChat = () => {
    if (!episodes[currentEpisode]) return;

    const channel = supabase
      .channel(`podcast-chat-${episodes[currentEpisode].id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "podcast_chat_messages",
          filter: `podcast_id=eq.${episodes[currentEpisode].id}`,
        },
        (payload) => {
          setChatMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !episodes[currentEpisode]) return;

    setSendingMessage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("podcast_chat_messages")
        .insert({
          podcast_id: episodes[currentEpisode].id,
          user_id: user.id,
          username: username,
          message: newMessage.trim(),
        });

      if (error) throw error;
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const getMediaUrl = (episode: PodcastEpisode) => {
    if (episode.episode_type === "live" && episode.youtube_live_url) {
      return episode.youtube_live_url.replace("watch?v=", "embed/");
    }
    return episode.audio_url;
  };

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-background pt-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (episodes.length === 0) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-background pt-16">
          <div className="container mx-auto px-6 py-8 text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">No Episodes Available</h2>
            <p className="text-muted-foreground">Check back soon for new podcast episodes!</p>
          </div>
        </div>
      </>
    );
  }

  const currentEp = episodes[currentEpisode];

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Live Stream/Player */}
            <div className="lg:col-span-2">
              <div className="bg-card rounded-xl overflow-hidden border border-border">
                <div className="aspect-video bg-black">
                  {currentEp.episode_type === "live" ? (
                    <iframe
                      width="100%"
                      height="100%"
                      src={getMediaUrl(currentEp)}
                      title={currentEp.title}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <audio controls className="w-full max-w-md">
                        <source src={currentEp.audio_url} type="audio/mpeg" />
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    {currentEp.is_live_now && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-destructive/10 border border-destructive/20 rounded-full">
                        <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
                        <span className="text-xs text-destructive font-medium">LIVE NOW</span>
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground">{currentEp.duration}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {currentEp.title}
                  </h2>
                  <p className="text-muted-foreground text-sm mb-4">
                    {currentEp.description}
                  </p>
                  <div className="flex gap-3">
                    <Button variant="hero">
                      <Play className="w-4 h-4 mr-2" />
                      {currentEp.episode_type === "live" ? "Watch Live" : "Listen Now"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Live Chat */}
              <div className="mt-6 bg-card rounded-xl p-6 border border-border">
                <h3 className="font-semibold text-foreground mb-4">
                  {currentEp.is_live_now ? "Live Chat" : "Episode Chat"}
                </h3>
                <div 
                  ref={chatContainerRef}
                  className="space-y-3 h-40 overflow-y-auto text-sm mb-4"
                >
                  {chatMessages.length === 0 ? (
                    <p className="text-muted-foreground text-center">No messages yet. Start the conversation!</p>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="flex gap-2">
                        <span className="font-semibold text-primary">{msg.username}:</span>
                        <span className="text-muted-foreground">{msg.message}</span>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={sendChatMessage} className="flex gap-2">
                  <Input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    disabled={sendingMessage}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={sendingMessage}>
                    {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </form>
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
                    key={episode.id}
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
                      {episode.is_live_now && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-destructive/10 rounded-full flex-shrink-0">
                          <div className="w-1.5 h-1.5 bg-destructive rounded-full"></div>
                          <span className="text-[10px] text-destructive font-medium">LIVE</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Episode {episode.episode_number}</span>
                      <span>•</span>
                      <span>{episode.duration}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Podcast;
