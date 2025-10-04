import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Shield, Users, CreditCard, Video, Podcast, Plus, Edit, Trash2 } from "lucide-react";

interface UserData {
  id: string;
  email: string;
  role: string;
  subscription: string;
  status: string;
}

interface VideoData {
  id: string;
  title: string;
  description: string;
  video_url: string;
  thumbnail_url: string;
  duration: string;
  category: string;
  status: string;
  view_count: number;
}

interface PodcastData {
  id: string;
  title: string;
  description: string;
  audio_url: string;
  episode_number: number;
  duration: string;
  show_notes: string;
  status: string;
  publish_date: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [podcasts, setPodcasts] = useState<PodcastData[]>([]);
  const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
  const [isPodcastDialogOpen, setIsPodcastDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoData | null>(null);
  const [editingPodcast, setEditingPodcast] = useState<PodcastData | null>(null);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    setIsAdmin(true);
    fetchUsers();
    fetchVideos();
    fetchPodcasts();
  };

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from("videos" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setVideos((data as any) || []);
    } catch (error) {
      console.error("Error fetching videos:", error);
      toast({
        title: "Error",
        description: "Failed to fetch videos",
        variant: "destructive",
      });
    }
  };

  const fetchPodcasts = async () => {
    try {
      const { data, error } = await supabase
        .from("podcasts" as any)
        .select("*")
        .order("episode_number", { ascending: false });

      if (error) throw error;
      setPodcasts((data as any) || []);
    } catch (error) {
      console.error("Error fetching podcasts:", error);
      toast({
        title: "Error",
        description: "Failed to fetch podcasts",
        variant: "destructive",
      });
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Get all users with their roles and subscriptions
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select(`
          user_id,
          role
        `);

      const { data: subsData } = await supabase
        .from("subscriptions")
        .select("*");

      // Get user emails from profiles or auth
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*");

      const usersMap = new Map();
      
      rolesData?.forEach((role) => {
        usersMap.set(role.user_id, {
          id: role.user_id,
          role: role.role,
          email: "Loading...",
          subscription: "None",
          status: "N/A"
        });
      });

      subsData?.forEach((sub) => {
        const user = usersMap.get(sub.user_id);
        if (user) {
          user.subscription = sub.plan_name;
          user.status = sub.status;
        }
      });

      setUsers(Array.from(usersMap.values()));
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: "admin" | "user" | "free_user") => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "User role updated successfully",
      });
      fetchUsers();
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    }
  };

  const updateSubscription = async (userId: string, planName: string) => {
    try {
      const { error } = await supabase
        .from("subscriptions")
        .upsert({
          user_id: userId,
          plan_name: planName,
          status: "active",
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Subscription updated successfully",
      });
      fetchUsers();
    } catch (error) {
      console.error("Error updating subscription:", error);
      toast({
        title: "Error",
        description: "Failed to update subscription",
        variant: "destructive",
      });
    }
  };

  const saveVideo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const videoData = {
        title: formData.get("title") as string,
        description: formData.get("description") as string,
        video_url: formData.get("video_url") as string,
        thumbnail_url: formData.get("thumbnail_url") as string,
        duration: formData.get("duration") as string,
        category: formData.get("category") as string,
        status: formData.get("status") as string,
      };

      if (editingVideo) {
        const { error } = await supabase
          .from("videos" as any)
          .update(videoData)
          .eq("id", editingVideo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("videos" as any)
          .insert([videoData]);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Video ${editingVideo ? "updated" : "created"} successfully`,
      });
      
      setIsVideoDialogOpen(false);
      setEditingVideo(null);
      fetchVideos();
    } catch (error) {
      console.error("Error saving video:", error);
      toast({
        title: "Error",
        description: "Failed to save video",
        variant: "destructive",
      });
    }
  };

  const deleteVideo = async (id: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    
    try {
      const { error } = await supabase
        .from("videos" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Video deleted successfully",
      });
      fetchVideos();
    } catch (error) {
      console.error("Error deleting video:", error);
      toast({
        title: "Error",
        description: "Failed to delete video",
        variant: "destructive",
      });
    }
  };

  const savePodcast = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const podcastData = {
        title: formData.get("title") as string,
        description: formData.get("description") as string,
        audio_url: formData.get("audio_url") as string,
        episode_number: parseInt(formData.get("episode_number") as string),
        duration: formData.get("duration") as string,
        show_notes: formData.get("show_notes") as string,
        status: formData.get("status") as string,
        publish_date: formData.get("publish_date") as string,
      };

      if (editingPodcast) {
        const { error } = await supabase
          .from("podcasts" as any)
          .update(podcastData)
          .eq("id", editingPodcast.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("podcasts" as any)
          .insert([podcastData]);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Podcast ${editingPodcast ? "updated" : "created"} successfully`,
      });
      
      setIsPodcastDialogOpen(false);
      setEditingPodcast(null);
      fetchPodcasts();
    } catch (error) {
      console.error("Error saving podcast:", error);
      toast({
        title: "Error",
        description: "Failed to save podcast",
        variant: "destructive",
      });
    }
  };

  const deletePodcast = async (id: string) => {
    if (!confirm("Are you sure you want to delete this podcast?")) return;
    
    try {
      const { error } = await supabase
        .from("podcasts" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Podcast deleted successfully",
      });
      fetchPodcasts();
    } catch (error) {
      console.error("Error deleting podcast:", error);
      toast({
        title: "Error",
        description: "Failed to delete podcast",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pt-16">
      <div className="container mx-auto p-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Admin Portal</h1>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(u => u.subscription !== "None").length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(u => u.role === "admin").length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="mr-2 h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="videos">
              <Video className="mr-2 h-4 w-4" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="podcasts">
              <Podcast className="mr-2 h-4 w-4" />
              Podcasts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage user roles and subscriptions</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono text-xs">{user.id.slice(0, 8)}...</TableCell>
                        <TableCell>
                          <Select
                            value={user.role}
                            onValueChange={(value) => updateUserRole(user.id, value as "admin" | "user" | "free_user")}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="free_user">Free User</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.subscription}
                            onValueChange={(value) => updateSubscription(user.id, value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="None">None</SelectItem>
                              <SelectItem value="Basic">Basic</SelectItem>
                              <SelectItem value="Pro">Pro</SelectItem>
                              <SelectItem value="Enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${
                            user.status === "active" ? "bg-success/20 text-success" :
                            user.status === "N/A" ? "bg-muted text-muted-foreground" :
                            "bg-destructive/20 text-destructive"
                          }`}>
                            {user.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">View Details</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="videos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Education Videos</CardTitle>
                  <CardDescription>Manage educational video content</CardDescription>
                </div>
                <Dialog open={isVideoDialogOpen} onOpenChange={setIsVideoDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingVideo(null)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Video
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <form onSubmit={saveVideo}>
                      <DialogHeader>
                        <DialogTitle>{editingVideo ? "Edit" : "Add"} Video</DialogTitle>
                        <DialogDescription>
                          {editingVideo ? "Update" : "Create a new"} education video
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="title">Title</Label>
                          <Input id="title" name="title" defaultValue={editingVideo?.title} required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="description">Description</Label>
                          <Textarea id="description" name="description" defaultValue={editingVideo?.description} required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="video_url">Video URL</Label>
                          <Input id="video_url" name="video_url" type="url" defaultValue={editingVideo?.video_url} required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="thumbnail_url">Thumbnail URL</Label>
                          <Input id="thumbnail_url" name="thumbnail_url" type="url" defaultValue={editingVideo?.thumbnail_url} required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="duration">Duration</Label>
                            <Input id="duration" name="duration" placeholder="15:30" defaultValue={editingVideo?.duration} required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="category">Category</Label>
                            <Input id="category" name="category" defaultValue={editingVideo?.category} required />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="status">Status</Label>
                          <Select name="status" defaultValue={editingVideo?.status || "published"}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="published">Published</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="submit">{editingVideo ? "Update" : "Create"}</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {videos.map((video) => (
                      <TableRow key={video.id}>
                        <TableCell className="font-medium">{video.title}</TableCell>
                        <TableCell>{video.category}</TableCell>
                        <TableCell>{video.duration}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${
                            video.status === "published" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                          }`}>
                            {video.status}
                          </span>
                        </TableCell>
                        <TableCell>{video.view_count}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingVideo(video);
                                setIsVideoDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteVideo(video.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="podcasts">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Podcast Episodes</CardTitle>
                  <CardDescription>Manage podcast content</CardDescription>
                </div>
                <Dialog open={isPodcastDialogOpen} onOpenChange={setIsPodcastDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingPodcast(null)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Episode
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <form onSubmit={savePodcast}>
                      <DialogHeader>
                        <DialogTitle>{editingPodcast ? "Edit" : "Add"} Podcast Episode</DialogTitle>
                        <DialogDescription>
                          {editingPodcast ? "Update" : "Create a new"} podcast episode
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="title">Title</Label>
                          <Input id="title" name="title" defaultValue={editingPodcast?.title} required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="description">Description</Label>
                          <Textarea id="description" name="description" defaultValue={editingPodcast?.description} required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="audio_url">Audio URL</Label>
                          <Input id="audio_url" name="audio_url" type="url" defaultValue={editingPodcast?.audio_url} required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="episode_number">Episode Number</Label>
                            <Input id="episode_number" name="episode_number" type="number" defaultValue={editingPodcast?.episode_number} required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="duration">Duration</Label>
                            <Input id="duration" name="duration" placeholder="45:30" defaultValue={editingPodcast?.duration} required />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="show_notes">Show Notes</Label>
                          <Textarea id="show_notes" name="show_notes" defaultValue={editingPodcast?.show_notes} required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="publish_date">Publish Date</Label>
                            <Input id="publish_date" name="publish_date" type="date" defaultValue={editingPodcast?.publish_date} required />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="status">Status</Label>
                            <Select name="status" defaultValue={editingPodcast?.status || "published"}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="published">Published</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="submit">{editingPodcast ? "Update" : "Create"}</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Episode</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Publish Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {podcasts.map((podcast) => (
                      <TableRow key={podcast.id}>
                        <TableCell className="font-medium">#{podcast.episode_number}</TableCell>
                        <TableCell>{podcast.title}</TableCell>
                        <TableCell>{podcast.duration}</TableCell>
                        <TableCell>{new Date(podcast.publish_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${
                            podcast.status === "published" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                          }`}>
                            {podcast.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingPodcast(podcast);
                                setIsPodcastDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deletePodcast(podcast.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;