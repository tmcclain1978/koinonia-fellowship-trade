import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { CourseCard } from "@/components/academy/CourseCard";
import { ProgressSummary } from "@/components/academy/ProgressSummary";
import CourseRecommendations from "@/components/academy/CourseRecommendations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GraduationCap, BookOpen, Trophy, Filter, Sparkles, Target, Award, Rocket, Star } from "lucide-react";

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty_level: string;
  estimated_duration: string | null;
  order_index: number;
}

interface CourseProgress {
  course_id: string;
  total_lessons: number;
  completed_lessons: number;
}

const Academy = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseProgress, setCourseProgress] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedLevel, setSelectedLevel] = useState<string>("all");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    await fetchCourses();
    await fetchProgress(session.user.id);
  };

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .eq("status", "published")
      .order("order_index", { ascending: true });

    if (!error && data) {
      setCourses(data);
    }
    setLoading(false);
  };

  const fetchProgress = async (userId: string) => {
    const { data: progressData } = await supabase
      .from("user_course_progress")
      .select("course_id, lesson_id, completed")
      .eq("user_id", userId);

    if (progressData) {
      const progressMap = new Map<string, { total: number; completed: number }>();
      
      progressData.forEach(p => {
        const existing = progressMap.get(p.course_id) || { total: 0, completed: 0 };
        existing.total++;
        if (p.completed) existing.completed++;
        progressMap.set(p.course_id, existing);
      });

      const progress: CourseProgress[] = Array.from(progressMap.entries()).map(([course_id, data]) => ({
        course_id,
        total_lessons: data.total,
        completed_lessons: data.completed
      }));

      setCourseProgress(progress);
    }
  };

  const getProgressForCourse = (courseId: string) => {
    return courseProgress.find(p => p.course_id === courseId);
  };

  const filteredCourses = selectedLevel === "all" 
    ? courses 
    : courses.filter(c => c.difficulty_level === selectedLevel);

  const difficultyLevels = [
    { value: "all", label: "All Levels", color: "bg-gradient-to-r from-primary to-accent" },
    { value: "beginner", label: "Beginner", color: "bg-gradient-to-r from-emerald-500 to-green-500" },
    { value: "intermediate", label: "Intermediate", color: "bg-gradient-to-r from-amber-500 to-yellow-500" },
    { value: "advanced", label: "Advanced", color: "bg-gradient-to-r from-orange-500 to-red-500" },
    { value: "expert", label: "Expert", color: "bg-gradient-to-r from-purple-500 to-pink-500" }
  ];

  const totalCompleted = courseProgress.reduce((acc, p) => acc + p.completed_lessons, 0);
  const totalLessons = courseProgress.reduce((acc, p) => acc + p.total_lessons, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/20 border-t-primary"></div>
            <GraduationCap className="absolute inset-0 m-auto h-6 w-6 text-primary" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section with animated gradient */}
      <div className="relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/20 to-success/20" />
        <div className="absolute top-0 left-0 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-success/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
        
        <div className="relative container mx-auto px-4 py-16">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
            {/* Left side - Title and description */}
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-primary/20 backdrop-blur-sm border border-primary/30 rounded-full px-4 py-2 mb-6">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Master Options Trading</span>
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-gradient-to-br from-primary to-accent rounded-2xl shadow-lg shadow-primary/25">
                  <GraduationCap className="h-10 w-10 text-white" />
                </div>
                <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
                  Options Trading Academy
                </h1>
              </div>
              
              <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
                Transform your trading journey with our comprehensive courses. From beginner basics to expert strategies, 
                learn at your own pace with interactive lessons and real-world examples.
              </p>

              {/* Quick stats */}
              <div className="flex flex-wrap gap-6 mt-8">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-success/20 rounded-lg">
                    <Target className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{courses.length}</p>
                    <p className="text-xs text-muted-foreground">Courses</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">4</p>
                    <p className="text-xs text-muted-foreground">Skill Levels</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-accent/20 rounded-lg">
                    <Award className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">∞</p>
                    <p className="text-xs text-muted-foreground">Lifetime Access</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side - Progress Summary */}
            {user && courseProgress.length > 0 && (
              <div className="w-full lg:w-auto">
                <ProgressSummary 
                  completedLessons={totalCompleted}
                  totalLessons={totalLessons}
                  coursesInProgress={courseProgress.length}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Course Recommendations */}
      {user && courses.length > 0 && (
        <div className="container mx-auto px-4 pt-8">
          <CourseRecommendations userId={user.id} courses={courses} />
        </div>
      )}

      {/* Course Filters */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-2 bg-muted/50 rounded-full px-4 py-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filter:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {difficultyLevels.map(level => (
              <Button
                key={level.value}
                variant={selectedLevel === level.value ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedLevel(level.value)}
                className={`rounded-full transition-all duration-300 ${
                  selectedLevel === level.value 
                    ? `${level.color} border-0 text-white shadow-lg` 
                    : "hover:border-primary/50"
                }`}
              >
                {level.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Courses Grid */}
        {filteredCourses.length === 0 ? (
          <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-br from-muted/30 to-muted/10">
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full mb-6">
                <Rocket className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-3">No Courses Available Yet</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                We're crafting amazing courses for you. Check back soon for expert-led options trading content!
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course, index) => (
              <div 
                key={course.id} 
                className="animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CourseCard
                  course={course}
                  progress={getProgressForCourse(course.id)}
                  onClick={() => navigate(`/academy/course/${course.id}`)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Certificates Section */}
        {user && (
          <div className="mt-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-lg shadow-lg shadow-yellow-500/25">
                <Trophy className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Your Achievements</h2>
              <div className="flex items-center gap-1 ml-2">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              </div>
            </div>
            <CertificatesSection userId={user.id} />
          </div>
        )}
      </div>
    </div>
  );
};

const CertificatesSection = ({ userId }: { userId: string }) => {
  const [certificates, setCertificates] = useState<any[]>([]);

  useEffect(() => {
    fetchCertificates();
  }, [userId]);

  const fetchCertificates = async () => {
    const { data } = await supabase
      .from("course_certificates")
      .select(`
        *,
        courses:course_id (title)
      `)
      .eq("user_id", userId)
      .order("issued_at", { ascending: false });

    if (data) {
      setCertificates(data);
    }
  };

  if (certificates.length === 0) {
    return (
      <Card className="border-dashed border-2 border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-amber-500/5">
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-yellow-400/20 to-amber-500/20 rounded-full mb-4">
            <Trophy className="h-8 w-8 text-yellow-500" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Certificates Yet</h3>
          <p className="text-muted-foreground">
            Complete courses to earn your certificates and showcase your expertise!
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {certificates.map((cert, index) => (
        <Card 
          key={cert.id} 
          className="overflow-hidden group hover:shadow-xl hover:shadow-yellow-500/10 transition-all duration-300 animate-fade-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="h-2 bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500" />
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl shadow-lg shadow-yellow-500/25 group-hover:scale-110 transition-transform">
                <Trophy className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">{cert.courses?.title}</h3>
                <p className="text-sm text-muted-foreground">
                  Completed {new Date(cert.issued_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
                  #{cert.certificate_number}
                </p>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default Academy;