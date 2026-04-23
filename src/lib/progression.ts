export const QUESTIONS_PER_LEVEL = 10;
export const MAX_LEVEL = 4;

export const getLevelFromCorrectAnswers = (correctAnswers: number) => {
  const safeCorrectAnswers = Math.max(0, correctAnswers || 0);

  return Math.min(Math.floor(safeCorrectAnswers / QUESTIONS_PER_LEVEL) + 1, MAX_LEVEL);
};

export const getLevelProgress = (correctAnswers: number, currentLevel: number) => {
  const safeCorrectAnswers = Math.max(0, correctAnswers || 0);
  const normalizedLevel = Math.min(Math.max(1, currentLevel || 1), MAX_LEVEL);
  const isMaxLevel = normalizedLevel >= MAX_LEVEL;

  if (isMaxLevel) {
    return {
      currentLevel: MAX_LEVEL,
      isMaxLevel: true,
      progressPercentage: 100,
      questionsIntoCurrentLevel: QUESTIONS_PER_LEVEL,
      remainingQuestions: 0,
    };
  }

  const completedBeforeCurrentLevel = (normalizedLevel - 1) * QUESTIONS_PER_LEVEL;
  const rawQuestionsIntoLevel = safeCorrectAnswers - completedBeforeCurrentLevel;
  const questionsIntoCurrentLevel = Math.min(
    QUESTIONS_PER_LEVEL,
    Math.max(0, rawQuestionsIntoLevel),
  );
  const remainingQuestions = Math.max(0, QUESTIONS_PER_LEVEL - questionsIntoCurrentLevel);

  return {
    currentLevel: normalizedLevel,
    isMaxLevel: false,
    progressPercentage: (questionsIntoCurrentLevel / QUESTIONS_PER_LEVEL) * 100,
    questionsIntoCurrentLevel,
    remainingQuestions,
  };
};