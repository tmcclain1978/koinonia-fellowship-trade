import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Circle,
  PlayCircle,
  BookOpen,
  Clock
} from "lucide-react";
import { toast } from "sonner";

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  content_markdown: string | null;
  duration: string | null;
  module_id: string;
  order_index: number;
}

interface Module {
  id: string;
  title: string;
  course_id: string;
  order_index: number;
}

interface Course {
  id: string;
  title: string;
}

interface SidebarLesson {
  id: string;
  title: string;
  duration: string | null;
  module_id: string;
  order_index: number;
  completed: boolean;
}

const LessonPlayer = () => {
  const navigate = useNavigate();
  const { lessonId } = useParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [module, setModule] = useState<Module | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [allLessons, setAllLessons] = useState<SidebarLesson[]>([]);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [lessonId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    await fetchLessonData(session.user.id);
  };

  const fetchLessonData = async (userId: string) => {
    if (!lessonId) return;

    // Fetch lesson
    const { data: lessonData, error } = await supabase
      .from("course_lessons")
      .select("*")
      .eq("id", lessonId)
      .single();

    if (error || !lessonData) {
      navigate("/academy");
      return;
    }

    setLesson(lessonData);

    // Fetch module
    const { data: moduleData } = await supabase
      .from("course_modules")
      .select("*")
      .eq("id", lessonData.module_id)
      .single();

    if (moduleData) {
      setModule(moduleData);

      // Fetch course
      const { data: courseData } = await supabase
        .from("courses")
        .select("id, title")
        .eq("id", moduleData.course_id)
        .single();

      if (courseData) {
        setCourse(courseData);

        // Fetch all modules for this course
        const { data: allModulesData } = await supabase
          .from("course_modules")
          .select("*")
          .eq("course_id", courseData.id)
          .eq("status", "published")
          .order("order_index", { ascending: true });

        if (allModulesData) {
          setAllModules(allModulesData);

          // Fetch all lessons for sidebar
          const moduleIds = allModulesData.map(m => m.id);
          const { data: lessonsData } = await supabase
            .from("course_lessons")
            .select("id, title, duration, module_id, order_index")
            .in("module_id", moduleIds)
            .eq("status", "published")
            .order("order_index", { ascending: true });

          // Fetch user progress
          const { data: progressData } = await supabase
            .from("user_course_progress")
            .select("lesson_id, completed")
            .eq("user_id", userId)
            .eq("course_id", courseData.id);

          const progressMap = new Map(progressData?.map(p => [p.lesson_id, p.completed]) || []);

          if (lessonsData) {
            setAllLessons(lessonsData.map(l => ({
              ...l,
              completed: progressMap.get(l.id) || false
            })));
          }

          // Check if current lesson is completed
          setIsCompleted(progressMap.get(lessonId) || false);
        }
      }
    }

    setLoading(false);
  };

  const markAsComplete = async () => {
    if (!user || !lesson || !course) return;

    const { error } = await supabase
      .from("user_course_progress")
      .upsert({
        user_id: user.id,
        course_id: course.id,
        lesson_id: lesson.id,
        completed: true,
        completed_at: new Date().toISOString()
      }, {
        onConflict: "user_id,lesson_id"
      });

    if (error) {
      toast.error("Failed to mark lesson as complete");
      return;
    }

    setIsCompleted(true);
    setAllLessons(prev => prev.map(l => 
      l.id === lesson.id ? { ...l, completed: true } : l
    ));
    toast.success("Lesson marked as complete!");

    // Check if course is complete and issue certificate
    await checkCourseCompletion();
  };

  const checkCourseCompletion = async () => {
    if (!user || !course) return;

    const { data: progressData } = await supabase
      .from("user_course_progress")
      .select("lesson_id, completed")
      .eq("user_id", user.id)
      .eq("course_id", course.id);

    const completedCount = progressData?.filter(p => p.completed).length || 0;
    
    if (completedCount === allLessons.length && allLessons.length > 0) {
      // Issue certificate
      const certNumber = `CERT-${course.id.slice(0, 8)}-${user.id.slice(0, 8)}-${Date.now()}`.toUpperCase();
      
      const { error } = await supabase
        .from("course_certificates")
        .upsert({
          user_id: user.id,
          course_id: course.id,
          certificate_number: certNumber
        }, {
          onConflict: "user_id,course_id"
        });

      if (!error) {
        toast.success("🎉 Congratulations! You've completed the course and earned a certificate!");
      }
    }
  };

  const getAdjacentLessons = () => {
    if (!lesson) return { prev: null, next: null };

    // Sort all lessons by module order, then lesson order
    const sortedLessons = [...allLessons].sort((a, b) => {
      const modA = allModules.find(m => m.id === a.module_id);
      const modB = allModules.find(m => m.id === b.module_id);
      if (!modA || !modB) return 0;
      if (modA.order_index !== modB.order_index) {
        return modA.order_index - modB.order_index;
      }
      return a.order_index - b.order_index;
    });

    const currentIndex = sortedLessons.findIndex(l => l.id === lesson.id);
    
    return {
      prev: currentIndex > 0 ? sortedLessons[currentIndex - 1] : null,
      next: currentIndex < sortedLessons.length - 1 ? sortedLessons[currentIndex + 1] : null
    };
  };

  const getYouTubeEmbedUrl = (url: string | null) => {
    if (!url) return null;
    
    // Convert various YouTube URL formats to embed format
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (videoIdMatch) {
      return `https://www.youtube.com/embed/${videoIdMatch[1]}`;
    }
    
    // Already an embed URL
    if (url.includes("youtube.com/embed/")) {
      return url;
    }
    
    return url;
  };

  const { prev, next } = getAdjacentLessons();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!lesson || !module || !course) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="flex">
        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate(`/academy/course/${course.id}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              {course.title}
            </Button>
            <span>/</span>
            <span>{module.title}</span>
          </div>

          {/* Video Player */}
          <div className="aspect-video bg-black rounded-lg overflow-hidden mb-6">
            {lesson.video_url ? (
              <iframe
                src={getYouTubeEmbedUrl(lesson.video_url) || ""}
                title={lesson.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <PlayCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>No video available for this lesson</p>
                </div>
              </div>
            )}
          </div>

          {/* Lesson Info */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-foreground">{lesson.title}</h1>
              {lesson.duration && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {lesson.duration}
                </Badge>
              )}
            </div>
            {lesson.description && (
              <p className="text-muted-foreground">{lesson.description}</p>
            )}
          </div>

          {/* Mark Complete Button */}
          <div className="mb-8">
            <Button
              onClick={markAsComplete}
              disabled={isCompleted}
              className={isCompleted ? "bg-green-600 hover:bg-green-600" : ""}
            >
              {isCompleted ? (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Completed
                </>
              ) : (
                <>
                  <Circle className="h-5 w-5 mr-2" />
                  Mark as Complete
                </>
              )}
            </Button>
          </div>

          {/* Written Content */}
          {lesson.content_markdown && (
            <Card className="mb-8">
              <CardContent className="pt-6 prose prose-invert max-w-none">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold m-0">Lesson Notes</h2>
                </div>
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {lesson.content_markdown}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center pt-6 border-t border-border">
            {prev ? (
              <Button 
                variant="outline"
                onClick={() => navigate(`/academy/lesson/${prev.id}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous: {prev.title}
              </Button>
            ) : (
              <div />
            )}
            
            {next ? (
              <Button 
                onClick={() => navigate(`/academy/lesson/${next.id}`)}
              >
                Next: {next.title}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={() => navigate(`/academy/course/${course.id}`)}
              >
                Back to Course
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden lg:block w-80 border-l border-border bg-card">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Course Content</h3>
          </div>
          <ScrollArea className="h-[calc(100vh-180px)]">
            <div className="p-2">
              {allModules.map(mod => (
                <div key={mod.id} className="mb-4">
                  <h4 className="text-sm font-medium text-muted-foreground px-3 py-2">
                    {mod.title}
                  </h4>
                  <div className="space-y-1">
                    {allLessons
                      .filter(l => l.module_id === mod.id)
                      .sort((a, b) => a.order_index - b.order_index)
                      .map(l => (
                        <button
                          key={l.id}
                          onClick={() => navigate(`/academy/lesson/${l.id}`)}
                          className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                            l.id === lesson.id 
                              ? "bg-primary/20 text-primary" 
                              : "hover:bg-muted text-foreground"
                          }`}
                        >
                          {l.completed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="text-sm truncate">{l.title}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default LessonPlayer;
