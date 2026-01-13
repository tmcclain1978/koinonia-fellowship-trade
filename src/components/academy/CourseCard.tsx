import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, BookOpen, PlayCircle, CheckCircle2, Sparkles } from "lucide-react";

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty_level: string;
  estimated_duration: string | null;
}

interface CourseProgress {
  course_id: string;
  total_lessons: number;
  completed_lessons: number;
}

interface CourseCardProps {
  course: Course;
  progress?: CourseProgress;
  onClick: () => void;
}

export const CourseCard: React.FC<CourseCardProps> = ({ course, progress, onClick }) => {
  const getDifficultyStyle = (level: string) => {
    switch (level) {
      case "beginner": 
        return {
          badge: "bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 shadow-lg shadow-emerald-500/25",
          gradient: "from-emerald-500/30 to-green-500/20",
          icon: "text-emerald-400"
        };
      case "intermediate": 
        return {
          badge: "bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-0 shadow-lg shadow-amber-500/25",
          gradient: "from-amber-500/30 to-yellow-500/20",
          icon: "text-amber-400"
        };
      case "advanced": 
        return {
          badge: "bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 shadow-lg shadow-orange-500/25",
          gradient: "from-orange-500/30 to-red-500/20",
          icon: "text-orange-400"
        };
      case "expert": 
        return {
          badge: "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 shadow-lg shadow-purple-500/25",
          gradient: "from-purple-500/30 to-pink-500/20",
          icon: "text-purple-400"
        };
      default: 
        return {
          badge: "bg-muted text-muted-foreground",
          gradient: "from-muted/30 to-muted/20",
          icon: "text-muted-foreground"
        };
    }
  };

  const style = getDifficultyStyle(course.difficulty_level);
  const progressPercentage = progress 
    ? Math.round((progress.completed_lessons / progress.total_lessons) * 100) 
    : 0;
  const isCompleted = progress && progressPercentage === 100;

  return (
    <Card 
      className="cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/50 hover:-translate-y-1 overflow-hidden group relative"
      onClick={onClick}
    >
      {/* Completed badge overlay */}
      {isCompleted && (
        <div className="absolute top-3 right-3 z-10">
          <div className="flex items-center gap-1 bg-success/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </div>
        </div>
      )}

      {/* Thumbnail with gradient overlay */}
      <div className={`relative h-44 bg-gradient-to-br ${style.gradient} overflow-hidden`}>
        {course.thumbnail_url ? (
          <>
            <img 
              src={course.thumbnail_url} 
              alt={course.title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/10 to-success/10" />
            <div className="relative p-6 bg-background/10 backdrop-blur-sm rounded-2xl">
              <BookOpen className={`h-12 w-12 ${style.icon}`} />
            </div>
          </div>
        )}
        
        {/* Difficulty Badge */}
        <Badge className={`absolute top-3 left-3 ${style.badge} capitalize font-medium`}>
          {course.difficulty_level}
        </Badge>
      </div>

      <CardHeader className="pb-2 pt-4">
        <h3 className="font-bold text-lg text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {course.title}
        </h3>
      </CardHeader>

      <CardContent className="space-y-4">
        {course.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {course.description}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {course.estimated_duration && (
            <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-full">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">{course.estimated_duration}</span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {progress && progress.total_lessons > 0 && (
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground font-medium">Your Progress</span>
              <span className={`font-bold ${isCompleted ? 'text-success' : 'text-primary'}`}>
                {progressPercentage}%
              </span>
            </div>
            <div className="relative">
              <Progress value={progressPercentage} className="h-2" />
              {isCompleted && (
                <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-success animate-pulse" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {progress.completed_lessons} of {progress.total_lessons} lessons completed
            </p>
          </div>
        )}

        {/* CTA */}
        <div className={`flex items-center gap-2 text-sm font-semibold pt-2 transition-colors ${
          isCompleted ? 'text-success' : 'text-primary group-hover:text-primary/80'
        }`}>
          <div className={`p-1.5 rounded-full ${isCompleted ? 'bg-success/20' : 'bg-primary/20'}`}>
            <PlayCircle className="h-4 w-4" />
          </div>
          {isCompleted 
            ? "Review Course" 
            : progress && progress.completed_lessons > 0 
              ? "Continue Learning" 
              : "Start Course"
          }
        </div>
      </CardContent>
    </Card>
  );
};