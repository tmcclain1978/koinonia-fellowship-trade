import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, BookOpen, PlayCircle } from "lucide-react";

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
  const getDifficultyColor = (level: string) => {
    switch (level) {
      case "beginner": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "intermediate": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "advanced": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "expert": return "bg-red-500/20 text-red-400 border-red-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const progressPercentage = progress 
    ? Math.round((progress.completed_lessons / progress.total_lessons) * 100) 
    : 0;

  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 overflow-hidden group"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative h-40 bg-gradient-to-br from-primary/20 to-accent/20 overflow-hidden">
        {course.thumbnail_url ? (
          <img 
            src={course.thumbnail_url} 
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-16 w-16 text-primary/40" />
          </div>
        )}
        <Badge 
          className={`absolute top-3 left-3 ${getDifficultyColor(course.difficulty_level)} capitalize`}
        >
          {course.difficulty_level}
        </Badge>
      </div>

      <CardHeader className="pb-2">
        <h3 className="font-semibold text-lg text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {course.title}
        </h3>
      </CardHeader>

      <CardContent className="space-y-4">
        {course.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {course.description}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {course.estimated_duration && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {course.estimated_duration}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {progress && progress.total_lessons > 0 && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-foreground font-medium">{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {progress.completed_lessons} / {progress.total_lessons} lessons
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center gap-2 text-primary text-sm font-medium pt-2">
          <PlayCircle className="h-4 w-4" />
          {progress && progress.completed_lessons > 0 
            ? "Continue Learning" 
            : "Start Course"
          }
        </div>
      </CardContent>
    </Card>
  );
};
