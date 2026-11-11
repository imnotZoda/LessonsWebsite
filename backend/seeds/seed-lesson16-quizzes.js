const fs = require('fs');
const path = require('path');
const db = require('../db');

const quizFile = path.join(__dirname, 'lesson16-navigation-quizzes.json');
const parentTopicTitle = 'Autonomous Navigation & Optimal Path Planning';
const lessonCodePattern = /^(?:Lesson\s+)?L?16\.(\d+)\b/i;

function validateQuizzes(quizzes) {
  if (!Array.isArray(quizzes) || quizzes.length !== 10) {
    throw new Error('The seed data must contain exactly ten lesson quizzes.');
  }

  const lessonCodes = new Set();
  for (const quiz of quizzes) {
    if (!/^L16\.(?:[1-9]|10)$/.test(quiz.lessonCode) || lessonCodes.has(quiz.lessonCode)) {
      throw new Error(`Invalid or duplicate lesson code: ${quiz.lessonCode}`);
    }
    lessonCodes.add(quiz.lessonCode);
    if (!quiz.title || !Array.isArray(quiz.questions) || quiz.questions.length !== 5) {
      throw new Error(`${quiz.lessonCode} must have a title and exactly five questions.`);
    }
    for (const [questionIndex, question] of quiz.questions.entries()) {
      if (!question.questionText || !Array.isArray(question.options) || question.options.length < 2 ||
          question.options.filter((option) => option.isCorrect === true).length !== 1 ||
          question.options.some((option) => !option.text)) {
        throw new Error(`${quiz.lessonCode} question ${questionIndex + 1} has invalid options or answer data.`);
      }
    }
  }
}

async function seed() {
  const quizzes = JSON.parse(fs.readFileSync(quizFile, 'utf8'));
  validateQuizzes(quizzes);

  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [parents] = await connection.query(
      'SELECT id FROM topics WHERE title = ? AND parent_topic_id IS NULL FOR UPDATE',
      [parentTopicTitle]
    );
    if (parents.length !== 1) {
      throw new Error(`Expected one top-level topic named "${parentTopicTitle}", found ${parents.length}.`);
    }

    const [topics] = await connection.query(
      'SELECT id, title FROM topics WHERE parent_topic_id = ? FOR UPDATE',
      [parents[0].id]
    );
    const topicsByLessonCode = new Map();
    for (const topic of topics) {
      const match = topic.title.match(lessonCodePattern);
      if (!match) continue;

      const lessonCode = `L16.${Number(match[1])}`;
      if (topicsByLessonCode.has(lessonCode)) {
        throw new Error(`Multiple topics match ${lessonCode} under "${parentTopicTitle}".`);
      }
      topicsByLessonCode.set(lessonCode, topic);
    }

    const topicIds = quizzes.map((quiz) => {
      const topic = topicsByLessonCode.get(quiz.lessonCode);
      if (!topic) {
        throw new Error(`No topic for ${quiz.lessonCode} was found under "${parentTopicTitle}".`);
      }
      return topic.id;
    });
    const [existingQuizzes] = await connection.query(
      'SELECT topic_id FROM quizzes WHERE topic_id IN (?)',
      [topicIds]
    );
    if (existingQuizzes.length > 0) {
      const existingTopicIds = new Set(existingQuizzes.map((quiz) => quiz.topic_id));
      const existingLessonCodes = quizzes
        .filter((quiz) => existingTopicIds.has(topicsByLessonCode.get(quiz.lessonCode).id))
        .map((quiz) => quiz.lessonCode);
      throw new Error(`Quizzes already exist for ${existingLessonCodes.join(', ')}; refusing to replace them.`);
    }

    for (const quiz of quizzes) {
      const topic = topicsByLessonCode.get(quiz.lessonCode);
      const [quizResult] = await connection.query(
        'INSERT INTO quizzes (topic_id, title, passing_score) VALUES (?, ?, ?)',
        [topic.id, quiz.title, quiz.passingScore]
      );
      for (const [questionIndex, question] of quiz.questions.entries()) {
        const [questionResult] = await connection.query(
          'INSERT INTO quiz_questions (quiz_id, question_text, points, sort_order) VALUES (?, ?, ?, ?)',
          [quizResult.insertId, question.questionText, question.points, questionIndex]
        );
        for (const [optionIndex, option] of question.options.entries()) {
          await connection.query(
            'INSERT INTO quiz_options (question_id, option_text, is_correct, sort_order) VALUES (?, ?, ?, ?)',
            [questionResult.insertId, option.text, option.isCorrect, optionIndex]
          );
        }
      }
      console.log(`Inserted ${quiz.lessonCode} quiz ${quizResult.insertId} for topic ${topic.id}: ${quiz.title}`);
    }

    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

seed()
  .catch((error) => {
    console.error('Lesson 16 quiz seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
