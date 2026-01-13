import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, TrendingUp, BookOpen, Star, ChevronRight, Brain, Target } from "lucide-react";

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty_level: string;
  estimated_duration: string | null;
  order_index: number;
}

interface CourseRecommendation {
  course: Course;
  reason: string;
  priority: number;
  icon: 'next-level' | 'skill-gap' | 'popular' | 'challenge';
}

interface UserStats {
  avgQuizScore: number;
  completedCourses: string[];
  coursesInProgress: string[];
  highestCompletedLevel: string;
}

interface CourseRecommendationsProps {
  userId: string;
  courses: Course[];
}

const DIFFICULTY_ORDER = ['beginner', 'intermediate', 'advanced', 'expert'];

const CourseRecommendations = ({ userId, courses }: CourseRecommendationsProps) => {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<CourseRecommendation[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId && courses.length > 0) {
      generateRecommendations();
    }
  }, [userId, courses]);

  const generateRecommendations = async () => {
    try {
      // Fetch user progress and quiz scores
      const { data: progressData } = await supabase
        .from("user_course_progress")
        .select("course_id, lesson_id, completed, quiz_score")
        .eq("user_id", userId);

      // Fetch course lesson counts
      const { data: lessonCounts } = await supabase
        .from("course_lessons")
        .select("id, module_id")
        .eq("status", "published");

      const { data: moduleCourses } = await supabase
        .from("course_modules")
        .select("id, course_id")
        .eq("status", "published");

      // Build course -> lesson count map
      const courseLessonCount = new Map<string, number>();
      if (moduleCourses && lessonCounts) {
        const moduleToCoursemap = new Map(moduleCourses.map(m => [m.id, m.course_id]));
        lessonCounts.forEach(lesson => {
          const courseId = moduleToCoursemap.get(lesson.module_id);
          if (courseId) {
            courseLessonCount.set(courseId, (courseLessonCount.get(courseId) || 0) + 1);
          }
        });
      }

      // Calculate user stats
      const courseProgressMap = new Map<string, { completed: number; total: number; quizScores: number[] }>();
      
      if (progressData) {
        progressData.forEach(p => {
          const existing = courseProgressMap.get(p.course_id) || { completed: 0, total: 0, quizScores: [] };
          existing.total++;
          if (p.completed) existing.completed++;
          if (p.quiz_score !== null) existing.quizScores.push(p.quiz_score);
          courseProgressMap.set(p.course_id, existing);
        });
      }

      // Determine completed courses
      const completedCourses: string[] = [];
      const coursesInProgress: string[] = [];
      let allQuizScores: number[] = [];

      courseProgressMap.forEach((progress, courseId) => {
        const totalLessons = courseLessonCount.get(courseId) || progress.total;
        allQuizScores = [...allQuizScores, ...progress.quizScores];
        
        if (progress.completed >= totalLessons && totalLessons > 0) {
          completedCourses.push(courseId);
        } else if (progress.completed > 0) {
          coursesInProgress.push(courseId);
        }
      });

      // Calculate average quiz score
      const avgQuizScore = allQuizScores.length > 0 
        ? allQuizScores.reduce((a, b) => a + b, 0) / allQuizScores.length 
        : 0;

      // Determine highest completed level
      let highestCompletedLevel = 'none';
      completedCourses.forEach(courseId => {
        const course = courses.find(c => c.id === courseId);
        if (course) {
          const currentIndex = DIFFICULTY_ORDER.indexOf(course.difficulty_level);
          const highestIndex = DIFFICULTY_ORDER.indexOf(highestCompletedLevel);
          if (currentIndex > highestIndex) {
            highestCompletedLevel = course.difficulty_level;
          }
        }
      });

      const stats: UserStats = {
        avgQuizScore,
        completedCourses,
        coursesInProgress,
        highestCompletedLevel
      };
      setUserStats(stats);

      // Generate recommendations
      const recs: CourseRecommendation[] = [];

      // Filter out completed courses
      const availableCourses = courses.filter(c => !completedCourses.includes(c.id));

      availableCourses.forEach(course => {
        const courseLevel = DIFFICULTY_ORDER.indexOf(course.difficulty_level);
        const userLevel = DIFFICULTY_ORDER.indexOf(highestCompletedLevel);
        const isInProgress = coursesInProgress.includes(course.id);

        // Priority 1: Continue courses in progress
        if (isInProgress) {
          recs.push({
            course,
            reason: "Continue where you left off",
            priority: 100,
            icon: 'next-level'
          });
          return;
        }

        // Priority 2: Next level course (natural progression)
        if (courseLevel === userLevel + 1) {
          recs.push({
            course,
            reason: avgQuizScore >= 85 
              ? "You're ready for the next level!" 
              : "Advance your skills to the next level",
            priority: 80,
            icon: 'next-level'
          });
          return;
        }

        // Priority 3: Same level courses user hasn't taken
        if (courseLevel === userLevel && highestCompletedLevel !== 'none') {
          recs.push({
            course,
            reason: "Broaden your knowledge at your current level",
            priority: 60,
            icon: 'skill-gap'
          });
          return;
        }

        // Priority 4: Beginner courses for new users
        if (highestCompletedLevel === 'none' && course.difficulty_level === 'beginner') {
          recs.push({
            course,
            reason: "Perfect starting point for beginners",
            priority: 90,
            icon: 'popular'
          });
          return;
        }

        // Priority 5: Challenge courses (if doing very well on quizzes)
        if (avgQuizScore >= 90 && courseLevel === userLevel + 2) {
          recs.push({
            course,
            reason: "Challenge yourself! Your quiz scores show you're ready",
            priority: 50,
            icon: 'challenge'
          });
          return;
        }

        // Priority 6: Any remaining courses at appropriate levels
        if (courseLevel <= userLevel + 1) {
          recs.push({
            course,
            reason: "Recommended based on your progress",
            priority: 30,
            icon: 'popular'
          });
        }
      });

      // Sort by priority and take top 3
      recs.sort((a, b) => b.priority - a.priority);
      setRecommendations(recs.slice(0, 3));
    } catch (error) {
      console.error("Error generating recommendations:", error);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: CourseRecommendation['icon']) => {
    switch (type) {
      case 'next-level': return <TrendingUp className="h-4 w-4" />;
      case 'skill-gap': return <Target className="h-4 w-4" />;
      case 'popular': return <Star className="h-4 w-4" />;
      case 'challenge': return <Brain className="h-4 w-4" />;
    }
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
      <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
        <CardContent className="py-8 text-center">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-muted"></div>
            <div className="h-4 w-48 rounded bg-muted"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Recommended for You</CardTitle>
        </div>
        <CardDescription>
          {userStats && userStats.avgQuizScore > 0 ? (
            <>Based on your {Math.round(userStats.avgQuizScore)}% average quiz score and progress</>
          ) : (
            <>Personalized course suggestions to accelerate your learning</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recommendations.map((rec, index) => (
            <div
              key={rec.course.id}
              className="group flex items-center gap-4 p-4 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer"
              onClick={() => navigate(`/academy/course/${rec.course.id}`)}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {getIcon(rec.icon)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-foreground truncate">{rec.course.title}</h3>
                  <Badge className={`${getDifficultyColor(rec.course.difficulty_level)} capitalize text-xs`}>
                    {rec.course.difficulty_level}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{rec.reason}</p>
              </div>
              
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          ))}
        </div>

        {userStats && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your Learning Stats</span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{userStats.completedCourses.length} completed</span>
                </div>
                {userStats.avgQuizScore > 0 && (
                  <div className="flex items-center gap-1">
                    <Brain className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground">{Math.round(userStats.avgQuizScore)}% avg quiz</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CourseRecommendations;
