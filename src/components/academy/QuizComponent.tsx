import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  XCircle, 
  Trophy, 
  RotateCcw,
  ChevronRight,
  Brain
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface QuizComponentProps {
  questions: QuizQuestion[];
  onComplete: (score: number, totalQuestions: number) => void;
  previousScore?: number | null;
}

export const QuizComponent: React.FC<QuizComponentProps> = ({
  questions,
  onComplete,
  previousScore
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(new Array(questions.length).fill(null));
  const [isComplete, setIsComplete] = useState(false);

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const isCorrect = selectedAnswer === currentQuestion.correctIndex;

  const handleAnswerSelect = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;
    
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = selectedAnswer;
    setAnswers(newAnswers);
    setShowResult(true);
  };

  const handleNextQuestion = () => {
    if (isLastQuestion) {
      // Calculate final score
      const correctCount = answers.reduce((count, answer, index) => {
        // Use the just-submitted answer for current question
        const actualAnswer = index === currentQuestionIndex ? selectedAnswer : answer;
        return count + (actualAnswer === questions[index].correctIndex ? 1 : 0);
      }, 0);
      
      setIsComplete(true);
      onComplete(correctCount, questions.length);
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    }
  };

  const handleRetake = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setAnswers(new Array(questions.length).fill(null));
    setIsComplete(false);
  };

  const calculateScore = () => {
    return answers.reduce((count, answer, index) => {
      const actualAnswer = index === currentQuestionIndex ? selectedAnswer : answer;
      return count + (actualAnswer === questions[index].correctIndex ? 1 : 0);
    }, 0);
  };

  const scorePercentage = Math.round((calculateScore() / questions.length) * 100);

  if (isComplete) {
    const finalScore = calculateScore();
    const passed = finalScore >= Math.ceil(questions.length * 0.7); // 70% to pass

    return (
      <Card className="border-primary/30">
        <CardHeader className="text-center pb-2">
          <div className={cn(
            "w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center",
            passed ? "bg-green-500/20" : "bg-yellow-500/20"
          )}>
            <Trophy className={cn(
              "h-10 w-10",
              passed ? "text-green-500" : "text-yellow-500"
            )} />
          </div>
          <CardTitle className="text-2xl">
            {passed ? "Quiz Passed!" : "Keep Learning!"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div>
            <p className="text-4xl font-bold text-foreground mb-2">
              {finalScore} / {questions.length}
            </p>
            <p className="text-muted-foreground">
              {scorePercentage}% correct
            </p>
          </div>

          <Progress value={scorePercentage} className="h-3" />

          <p className="text-muted-foreground">
            {passed 
              ? "Great job! You've demonstrated understanding of this lesson."
              : "Review the lesson and try again to improve your score."
            }
          </p>

          <Button onClick={handleRetake} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Retake Quiz
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Knowledge Check</CardTitle>
          </div>
          <span className="text-sm text-muted-foreground">
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
        </div>
        <Progress 
          value={((currentQuestionIndex + 1) / questions.length) * 100} 
          className="h-2" 
        />
      </CardHeader>
      
      <CardContent className="space-y-6">
        <p className="text-lg font-medium text-foreground">
          {currentQuestion.question}
        </p>

        <RadioGroup
          value={selectedAnswer?.toString()}
          onValueChange={(value) => handleAnswerSelect(parseInt(value))}
          className="space-y-3"
        >
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const isCorrectAnswer = index === currentQuestion.correctIndex;
            
            let optionClass = "border-border hover:border-primary/50";
            if (showResult) {
              if (isCorrectAnswer) {
                optionClass = "border-green-500 bg-green-500/10";
              } else if (isSelected && !isCorrectAnswer) {
                optionClass = "border-red-500 bg-red-500/10";
              }
            } else if (isSelected) {
              optionClass = "border-primary bg-primary/10";
            }

            return (
              <div
                key={index}
                className={cn(
                  "flex items-center space-x-3 p-4 rounded-lg border transition-all cursor-pointer",
                  optionClass,
                  showResult && "cursor-default"
                )}
                onClick={() => handleAnswerSelect(index)}
              >
                <RadioGroupItem 
                  value={index.toString()} 
                  id={`option-${index}`}
                  disabled={showResult}
                />
                <Label 
                  htmlFor={`option-${index}`} 
                  className="flex-1 cursor-pointer text-foreground"
                >
                  {option}
                </Label>
                {showResult && isCorrectAnswer && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {showResult && isSelected && !isCorrectAnswer && (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </div>
            );
          })}
        </RadioGroup>

        {showResult && currentQuestion.explanation && (
          <div className={cn(
            "p-4 rounded-lg",
            isCorrect ? "bg-green-500/10 border border-green-500/30" : "bg-yellow-500/10 border border-yellow-500/30"
          )}>
            <p className="text-sm font-medium mb-1">
              {isCorrect ? "Correct!" : "Explanation:"}
            </p>
            <p className="text-sm text-muted-foreground">
              {currentQuestion.explanation}
            </p>
          </div>
        )}

        <div className="flex justify-end pt-4">
          {!showResult ? (
            <Button 
              onClick={handleSubmitAnswer}
              disabled={selectedAnswer === null}
            >
              Submit Answer
            </Button>
          ) : (
            <Button onClick={handleNextQuestion} className="gap-2">
              {isLastQuestion ? "See Results" : "Next Question"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {previousScore !== null && previousScore !== undefined && (
          <p className="text-sm text-muted-foreground text-center pt-2">
            Your previous score: {previousScore}%
          </p>
        )}
      </CardContent>
    </Card>
  );
};
