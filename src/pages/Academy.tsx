import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { CourseCard } from "@/components/academy/CourseCard";
import { ProgressSummary } from "@/components/academy/ProgressSummary";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, BookOpen, Trophy, Filter } from "lucide-react";

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
    // Get all progress for user
    const { data: progressData } = await supabase
      .from("user_course_progress")
      .select("course_id, lesson_id, completed")
      .eq("user_id", userId);

    if (progressData) {
      // Group by course and count
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

  const difficultyLevels = ["all", "beginner", "intermediate", "advanced", "expert"];

  const totalCompleted = courseProgress.reduce((acc, p) => acc + p.completed_lessons, 0);
  const totalLessons = courseProgress.reduce((acc, p) => acc + p.total_lessons, 0);

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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary/20 via-accent/10 to-secondary/20 py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4 mb-4">
            <GraduationCap className="h-12 w-12 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">Options Trading Academy</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Master options trading from beginner to expert with our comprehensive courses. 
            Learn at your own pace with video lessons, written guides, and quizzes.
          </p>
          
          {user && courseProgress.length > 0 && (
            <div className="mt-8">
              <ProgressSummary 
                completedLessons={totalCompleted}
                totalLessons={totalLessons}
                coursesInProgress={courseProgress.length}
              />
            </div>
          )}
        </div>
      </div>

      {/* Course Filters */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filter by level:</span>
          {difficultyLevels.map(level => (
            <Button
              key={level}
              variant={selectedLevel === level ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedLevel(level)}
              className="capitalize"
            >
              {level === "all" ? "All Levels" : level}
            </Button>
          ))}
        </div>

        {/* Courses Grid */}
        {filteredCourses.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">No Courses Available Yet</h2>
            <p className="text-muted-foreground">
              We're working on creating amazing content for you. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                progress={getProgressForCourse(course.id)}
                onClick={() => navigate(`/academy/course/${course.id}`)}
              />
            ))}
          </div>
        )}

        {/* Certificates Section */}
        {user && (
          <div className="mt-16">
            <div className="flex items-center gap-3 mb-6">
              <Trophy className="h-6 w-6 text-yellow-500" />
              <h2 className="text-2xl font-bold text-foreground">Your Certificates</h2>
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
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          Complete courses to earn certificates!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {certificates.map(cert => (
        <div key={cert.id} className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <Trophy className="h-8 w-8 text-yellow-500" />
            <div>
              <h3 className="font-semibold text-foreground">{cert.courses?.title}</h3>
              <p className="text-sm text-muted-foreground">
                Issued: {new Date(cert.issued_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Certificate #{cert.certificate_number}
          </p>
        </div>
      ))}
    </div>
  );
};

export default Academy;
