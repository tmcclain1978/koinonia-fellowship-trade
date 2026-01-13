import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { LessonList } from "@/components/academy/LessonList";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  ArrowLeft, 
  Clock, 
  BookOpen, 
  PlayCircle, 
  CheckCircle2,
  GraduationCap,
  Eye
} from "lucide-react";

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty_level: string;
  estimated_duration: string | null;
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  lessons: Lesson[];
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  order_index: number;
}

interface UserProgress {
  lesson_id: string;
  completed: boolean;
}

const CourseDetail = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const isPreviewMode = searchParams.get("preview") === "true";
  
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (isPreviewMode) {
      // In preview mode, skip auth and just fetch course data
      fetchCourseData(true);
    } else {
      checkAuth();
    }
  }, [courseId, isPreviewMode]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    await fetchCourseData(false);
    await fetchUserProgress(session.user.id);
  };

  const fetchCourseData = async (isPreview: boolean = false) => {
    if (!courseId) return;

    // Fetch course - in preview mode, allow draft courses too
    let query = supabase
      .from("courses")
      .select("*")
      .eq("id", courseId);
    
    if (!isPreview) {
      query = query.eq("status", "published");
    }
    
    const { data: courseData, error: courseError } = await query.single();

    if (courseError || !courseData) {
      navigate("/academy");
      return;
    }

    setCourse(courseData);

    // Fetch modules with lessons - in preview mode, include drafts
    let modulesQuery = supabase
      .from("course_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("order_index", { ascending: true });
    
    if (!isPreview) {
      modulesQuery = modulesQuery.eq("status", "published");
    }
    
    const { data: modulesData } = await modulesQuery;

    if (modulesData) {
      const modulesWithLessons: Module[] = [];

      for (const mod of modulesData) {
        let lessonsQuery = supabase
          .from("course_lessons")
          .select("id, title, description, duration, order_index")
          .eq("module_id", mod.id)
          .order("order_index", { ascending: true });
        
        if (!isPreview) {
          lessonsQuery = lessonsQuery.eq("status", "published");
        }
        
        const { data: lessonsData } = await lessonsQuery;

        modulesWithLessons.push({
          ...mod,
          lessons: lessonsData || []
        });
      }

      setModules(modulesWithLessons);
    }

    setLoading(false);
  };

  const fetchUserProgress = async (userId: string) => {
    if (!courseId) return;

    const { data } = await supabase
      .from("user_course_progress")
      .select("lesson_id, completed")
      .eq("user_id", userId)
      .eq("course_id", courseId);

    if (data) {
      setUserProgress(data);
    }
  };

  const isLessonCompleted = (lessonId: string) => {
    return userProgress.find(p => p.lesson_id === lessonId)?.completed || false;
  };

  const getTotalLessons = () => {
    return modules.reduce((acc, m) => acc + m.lessons.length, 0);
  };

  const getCompletedLessons = () => {
    return userProgress.filter(p => p.completed).length;
  };

  const getProgressPercentage = () => {
    const total = getTotalLessons();
    if (total === 0) return 0;
    return Math.round((getCompletedLessons() / total) * 100);
  };

  const getFirstIncompleteLesson = () => {
    for (const mod of modules) {
      for (const lesson of mod.lessons) {
        if (!isLessonCompleted(lesson.id)) {
          return lesson.id;
        }
      }
    }
    return modules[0]?.lessons[0]?.id;
  };

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case "beginner": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "intermediate": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "advanced": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "expert": return "bg-red-500/20 text-red-400 border-red-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

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

  if (!course) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          className="mb-6"
          onClick={() => navigate(isPreviewMode ? "/admin" : "/academy")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {isPreviewMode ? "Back to Admin" : "Back to Academy"}
        </Button>

        {/* Preview Mode Banner */}
        {isPreviewMode && (
          <Alert className="mb-6 border-yellow-500/50 bg-yellow-500/10">
            <Eye className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-200">
              <strong>Preview Mode:</strong> You're viewing this course as students will see it. Progress is not being tracked. Draft content is visible.
            </AlertDescription>
          </Alert>
        )}

        {/* Course Header */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {course.thumbnail_url && (
              <img 
                src={course.thumbnail_url} 
                alt={course.title}
                className="w-full h-64 object-cover rounded-lg mb-6"
              />
            )}
            
            <div className="flex items-center gap-3 mb-4">
              <Badge className={`${getDifficultyColor(course.difficulty_level)} capitalize`}>
                {course.difficulty_level}
              </Badge>
              {course.estimated_duration && (
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Clock className="h-4 w-4" />
                  {course.estimated_duration}
                </div>
              )}
            </div>

            <h1 className="text-3xl font-bold text-foreground mb-4">{course.title}</h1>
            <p className="text-muted-foreground text-lg mb-8">{course.description}</p>

            {/* Modules & Lessons */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Course Content
              </h2>
              
              {modules.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">No lessons available yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <LessonList 
                  modules={modules}
                  userProgress={userProgress}
                  onLessonClick={(lessonId) => navigate(`/academy/lesson/${lessonId}${isPreviewMode ? "?preview=true" : ""}`)}
                />
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Your Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium text-foreground">
                      {getCompletedLessons()} / {getTotalLessons()} lessons
                    </span>
                  </div>
                  <Progress value={getProgressPercentage()} className="h-3" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {getProgressPercentage()}% complete
                  </p>
                </div>

                {getTotalLessons() > 0 && !isPreviewMode && (
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => {
                      const lessonId = getFirstIncompleteLesson();
                      if (lessonId) navigate(`/academy/lesson/${lessonId}`);
                    }}
                  >
                    {getCompletedLessons() === 0 ? (
                      <>
                        <PlayCircle className="h-5 w-5 mr-2" />
                        Start Course
                      </>
                    ) : getCompletedLessons() === getTotalLessons() ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                        Review Course
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-5 w-5 mr-2" />
                        Continue Learning
                      </>
                    )}
                  </Button>
                )}
                
                {getTotalLessons() > 0 && isPreviewMode && (
                  <Button 
                    className="w-full" 
                    size="lg"
                    variant="outline"
                    onClick={() => {
                      const lessonId = modules[0]?.lessons[0]?.id;
                      if (lessonId) navigate(`/academy/lesson/${lessonId}?preview=true`);
                    }}
                  >
                    <Eye className="h-5 w-5 mr-2" />
                    Preview First Lesson
                  </Button>
                )}

                <div className="pt-4 border-t border-border">
                  <h4 className="font-medium text-foreground mb-3">This course includes:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      {modules.length} modules
                    </li>
                    <li className="flex items-center gap-2">
                      <PlayCircle className="h-4 w-4" />
                      {getTotalLessons()} video lessons
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Certificate of completion
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;
