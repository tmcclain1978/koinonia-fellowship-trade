import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BookOpen, CheckCircle2, TrendingUp, Flame, Zap } from "lucide-react";

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

  const getProgressColor = () => {
    if (progressPercentage >= 80) return "from-success to-emerald-400";
    if (progressPercentage >= 50) return "from-primary to-accent";
    if (progressPercentage >= 25) return "from-amber-500 to-yellow-500";
    return "from-orange-500 to-red-500";
  };

  const getProgressMessage = () => {
    if (progressPercentage === 100) return "🎉 All complete!";
    if (progressPercentage >= 80) return "Almost there!";
    if (progressPercentage >= 50) return "Halfway done!";
    if (progressPercentage >= 25) return "Great progress!";
    return "Keep going!";
  };

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-card via-card to-primary/5 border-primary/20 shadow-xl shadow-primary/10">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-accent/20 to-transparent rounded-full blur-2xl" />
      
      <CardContent className="relative pt-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-lg">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <h3 className="font-bold text-foreground">Your Learning Journey</h3>
          <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
            {getProgressMessage()}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Overall Progress - Featured */}
          <div className="bg-muted/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${getProgressColor()} shadow-lg`}>
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Overall Progress</p>
                  <p className="text-2xl font-bold text-foreground">{progressPercentage}%</p>
                </div>
              </div>
              {progressPercentage > 0 && (
                <div className="flex items-center gap-1 text-orange-500">
                  <Flame className="h-5 w-5" />
                  <span className="text-sm font-bold">{coursesInProgress}</span>
                </div>
              )}
            </div>
            <div className="relative">
              <Progress value={progressPercentage} className="h-3 bg-muted" />
              <div 
                className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r ${getProgressColor()} transition-all duration-500`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Lessons Completed */}
            <div className="bg-success/10 border border-success/20 rounded-xl p-4 group hover:bg-success/15 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-success/20 rounded-lg group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lessons Done</p>
                  <p className="text-xl font-bold text-foreground">
                    {completedLessons}
                    <span className="text-sm font-normal text-muted-foreground">/{totalLessons}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Courses In Progress */}
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 group hover:bg-accent/15 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/20 rounded-lg group-hover:scale-110 transition-transform">
                  <BookOpen className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                  <p className="text-xl font-bold text-foreground">{coursesInProgress}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};