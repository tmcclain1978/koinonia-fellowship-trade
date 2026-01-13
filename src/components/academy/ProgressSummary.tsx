import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BookOpen, CheckCircle2, TrendingUp } from "lucide-react";

interface ProgressSummaryProps {
  completedLessons: number;
  totalLessons: number;
  coursesInProgress: number;
}

export const ProgressSummary: React.FC<ProgressSummaryProps> = ({
  completedLessons,
  totalLessons,
  coursesInProgress
}) => {
  const progressPercentage = totalLessons > 0 
    ? Math.round((completedLessons / totalLessons) * 100) 
    : 0;

  return (
    <Card className="bg-card/50 backdrop-blur border-primary/20">
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Overall Progress */}
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-primary/20">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1">Overall Progress</p>
              <Progress value={progressPercentage} className="h-2 mb-1" />
              <p className="text-sm font-medium text-foreground">{progressPercentage}% complete</p>
            </div>
          </div>

          {/* Lessons Completed */}
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-500/20">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Lessons Completed</p>
              <p className="text-2xl font-bold text-foreground">
                {completedLessons}
                <span className="text-sm font-normal text-muted-foreground"> / {totalLessons}</span>
              </p>
            </div>
          </div>

          {/* Courses In Progress */}
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-accent/20">
              <BookOpen className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Courses In Progress</p>
              <p className="text-2xl font-bold text-foreground">{coursesInProgress}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
