import React, { useState } from "react";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ChevronRight, 
  PlayCircle, 
  CheckCircle2, 
  Circle,
  Clock
} from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  order_index: number;
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  lessons: Lesson[];
}

interface UserProgress {
  lesson_id: string;
  completed: boolean;
}

interface LessonListProps {
  modules: Module[];
  userProgress: UserProgress[];
  onLessonClick: (lessonId: string) => void;
}

export const LessonList: React.FC<LessonListProps> = ({ 
  modules, 
  userProgress, 
  onLessonClick 
}) => {
  const [openModules, setOpenModules] = useState<Set<string>>(
    new Set(modules.map(m => m.id))
  );

  const toggleModule = (moduleId: string) => {
    setOpenModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const isLessonCompleted = (lessonId: string) => {
    return userProgress.find(p => p.lesson_id === lessonId)?.completed || false;
  };

  const getModuleProgress = (module: Module) => {
    const completedCount = module.lessons.filter(l => 
      isLessonCompleted(l.id)
    ).length;
    return { completed: completedCount, total: module.lessons.length };
  };

  return (
    <div className="space-y-3">
      {modules.map((module, index) => {
        const progress = getModuleProgress(module);
        const isOpen = openModules.has(module.id);

        return (
          <Collapsible 
            key={module.id} 
            open={isOpen}
            onOpenChange={() => toggleModule(module.id)}
          >
            <div className="border border-border rounded-lg overflow-hidden">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Module {index + 1}
                        </span>
                        {progress.completed === progress.total && progress.total > 0 && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      <h3 className="font-medium text-foreground">{module.title}</h3>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {progress.completed} / {progress.total} completed
                  </span>
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t border-border">
                  {module.lessons.map((lesson) => {
                    const completed = isLessonCompleted(lesson.id);

                    return (
                      <button
                        key={lesson.id}
                        onClick={() => onLessonClick(lesson.id)}
                        className="w-full flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors text-left border-b border-border last:border-b-0"
                      >
                        {completed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${completed ? "text-muted-foreground" : "text-foreground"}`}>
                            {lesson.title}
                          </p>
                          {lesson.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {lesson.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          {lesson.duration && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {lesson.duration}
                            </div>
                          )}
                          <PlayCircle className="h-5 w-5 text-primary" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
};
