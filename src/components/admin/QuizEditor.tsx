import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, HelpCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

interface QuizEditorProps {
  questions: QuizQuestion[];
  onChange: (questions: QuizQuestion[]) => void;
}

const QuizEditor = ({ questions, onChange }: QuizEditorProps) => {
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set([0]));

  const toggleQuestion = (index: number) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const addQuestion = () => {
    const newQuestion: QuizQuestion = {
      question: "",
      options: ["", "", "", ""],
      correctAnswer: 0,
      explanation: ""
    };
    const newQuestions = [...questions, newQuestion];
    onChange(newQuestions);
    setExpandedQuestions(prev => new Set(prev).add(newQuestions.length - 1));
  };

  const removeQuestion = (index: number) => {
    const newQuestions = questions.filter((_, i) => i !== index);
    onChange(newQuestions);
    setExpandedQuestions(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  };

  const updateQuestion = (index: number, field: keyof QuizQuestion, value: any) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    onChange(newQuestions);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const newQuestions = [...questions];
    const newOptions = [...newQuestions[questionIndex].options];
    newOptions[optionIndex] = value;
    newQuestions[questionIndex] = { ...newQuestions[questionIndex], options: newOptions };
    onChange(newQuestions);
  };

  const addOption = (questionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex] = {
      ...newQuestions[questionIndex],
      options: [...newQuestions[questionIndex].options, ""]
    };
    onChange(newQuestions);
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const newQuestions = [...questions];
    const question = newQuestions[questionIndex];
    const newOptions = question.options.filter((_, i) => i !== optionIndex);
    
    // Adjust correctAnswer if needed
    let newCorrectAnswer = question.correctAnswer;
    if (optionIndex < question.correctAnswer) {
      newCorrectAnswer = question.correctAnswer - 1;
    } else if (optionIndex === question.correctAnswer) {
      newCorrectAnswer = 0;
    }
    
    newQuestions[questionIndex] = {
      ...question,
      options: newOptions,
      correctAnswer: Math.min(newCorrectAnswer, newOptions.length - 1)
    };
    onChange(newQuestions);
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]];
    onChange(newQuestions);

    // Update expanded state
    setExpandedQuestions(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i === index) next.add(targetIndex);
        else if (i === targetIndex) next.add(index);
        else next.add(i);
      });
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-purple-500" />
          <Label className="text-sm font-medium">Quiz Questions</Label>
          <Badge variant="secondary" className="text-xs">
            {questions.length} question{questions.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
          <Plus className="h-3 w-3 mr-1" />
          Add Question
        </Button>
      </div>

      {questions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No quiz questions yet</p>
            <p className="text-xs">Add questions to test knowledge retention</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {questions.map((q, qIndex) => (
            <Card key={qIndex} className="overflow-hidden">
              <Collapsible
                open={expandedQuestions.has(qIndex)}
                onOpenChange={() => toggleQuestion(qIndex)}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveQuestion(qIndex, 'up');
                        }}
                        disabled={qIndex === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveQuestion(qIndex, 'down');
                        }}
                        disabled={qIndex === questions.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>

                    {expandedQuestions.has(qIndex) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}

                    <Badge variant="outline" className="text-xs">Q{qIndex + 1}</Badge>

                    <span className="flex-1 text-sm truncate">
                      {q.question || <span className="text-muted-foreground italic">Untitled question</span>}
                    </span>

                    <Badge variant="secondary" className="text-xs">
                      {q.options.filter(o => o.trim()).length} options
                    </Badge>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeQuestion(qIndex);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-xs">Question Text</Label>
                      <Textarea
                        value={q.question}
                        onChange={(e) => updateQuestion(qIndex, 'question', e.target.value)}
                        placeholder="Enter the question..."
                        className="min-h-[60px]"
                      />
                    </div>

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Answer Options</Label>
                        {q.options.length < 6 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => addOption(qIndex)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Option
                          </Button>
                        )}
                      </div>

                      <RadioGroup
                        value={q.correctAnswer.toString()}
                        onValueChange={(value) => updateQuestion(qIndex, 'correctAnswer', parseInt(value))}
                      >
                        <div className="space-y-2">
                          {q.options.map((option, oIndex) => (
                            <div key={oIndex} className="flex items-center gap-2">
                              <RadioGroupItem
                                value={oIndex.toString()}
                                id={`q${qIndex}-o${oIndex}`}
                                className="border-2"
                              />
                              <div className="flex-1 relative">
                                <Input
                                  value={option}
                                  onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                  placeholder={`Option ${oIndex + 1}`}
                                  className={q.correctAnswer === oIndex ? "border-green-500 pr-8" : ""}
                                />
                                {q.correctAnswer === oIndex && (
                                  <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                                )}
                              </div>
                              {q.options.length > 2 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeOption(qIndex, oIndex)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </RadioGroup>
                      <p className="text-xs text-muted-foreground">
                        Select the radio button next to the correct answer
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-xs">Explanation (Optional)</Label>
                      <Textarea
                        value={q.explanation || ''}
                        onChange={(e) => updateQuestion(qIndex, 'explanation', e.target.value)}
                        placeholder="Explain why this answer is correct..."
                        className="min-h-[60px]"
                      />
                      <p className="text-xs text-muted-foreground">
                        Shown after the student answers to help them learn
                      </p>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuizEditor;
