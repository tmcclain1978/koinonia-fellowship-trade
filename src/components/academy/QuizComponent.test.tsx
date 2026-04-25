import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuizComponent, QuizQuestion } from "./QuizComponent";

/**
 * Quiz answer-correctness tests.
 *
 * Background: the database stores quiz questions with one of three field names
 * for the correct option (`correctIndex`, `correct_answer`, `correctAnswer`).
 * Previously only `correctIndex` was honored, causing every answer to legacy
 * quizzes to be marked wrong. These tests lock in the normalization behavior.
 */

const renderQuiz = (questions: QuizQuestion[], onComplete = vi.fn()) =>
  render(<QuizComponent questions={questions} onComplete={onComplete} />);

const submitAnswer = (optionIndex: number) => {
  // Click the option label
  const radios = screen.getAllByRole("radio");
  fireEvent.click(radios[optionIndex]);
  fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
};

describe("QuizComponent answer normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the correct answer as correct when using `correctIndex`", () => {
    const onComplete = vi.fn();
    renderQuiz(
      [
        {
          question: "What is 2 + 2?",
          options: ["3", "4", "5", "6"],
          correctIndex: 1,
        },
      ],
      onComplete,
    );
    submitAnswer(1);
    // Result panel should reflect "Correct!" and not "Explanation:"
    expect(screen.getByText(/correct!/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));
    expect(onComplete).toHaveBeenCalledWith(1, 1);
  });

  it("marks the correct answer as correct when legacy `correct_answer` is used", () => {
    const onComplete = vi.fn();
    renderQuiz(
      [
        {
          question: "Capital of France?",
          options: ["Berlin", "Madrid", "Paris", "Rome"],
          // Legacy snake_case field — must still register as correct
          correct_answer: 2,
        } as unknown as QuizQuestion,
      ],
      onComplete,
    );
    submitAnswer(2);
    expect(screen.getByText(/correct!/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));
    expect(onComplete).toHaveBeenCalledWith(1, 1);
  });

  it("marks the correct answer as correct when legacy `correctAnswer` is used", () => {
    const onComplete = vi.fn();
    renderQuiz(
      [
        {
          question: "Largest planet?",
          options: ["Earth", "Mars", "Jupiter", "Saturn"],
          correctAnswer: 2,
        } as unknown as QuizQuestion,
      ],
      onComplete,
    );
    submitAnswer(2);
    expect(screen.getByText(/correct!/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));
    expect(onComplete).toHaveBeenCalledWith(1, 1);
  });

  it("marks a wrong answer as wrong (regression: incorrect must not pass)", () => {
    const onComplete = vi.fn();
    renderQuiz(
      [
        {
          question: "Capital of France?",
          options: ["Berlin", "Madrid", "Paris", "Rome"],
          correct_answer: 2,
        } as unknown as QuizQuestion,
      ],
      onComplete,
    );
    submitAnswer(0); // Berlin — wrong
    // Should NOT show "Correct!" header — should show "Explanation:" if any,
    // but we asserted no explanation, so just verify "Correct!" is absent.
    expect(screen.queryByText(/^correct!$/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));
    expect(onComplete).toHaveBeenCalledWith(0, 1);
  });

  it("scores a mixed-field quiz across multiple questions correctly", () => {
    const onComplete = vi.fn();
    renderQuiz(
      [
        { question: "Q1", options: ["a", "b"], correctIndex: 0 },
        { question: "Q2", options: ["a", "b"], correct_answer: 1 } as unknown as QuizQuestion,
        { question: "Q3", options: ["a", "b"], correctAnswer: 0 } as unknown as QuizQuestion,
      ],
      onComplete,
    );
    submitAnswer(0); // Q1 right
    fireEvent.click(screen.getByRole("button", { name: /next question/i }));
    submitAnswer(1); // Q2 right
    fireEvent.click(screen.getByRole("button", { name: /next question/i }));
    submitAnswer(0); // Q3 right
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));
    expect(onComplete).toHaveBeenCalledWith(3, 3);
  });
});
