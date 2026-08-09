/**
 * Demo fixture generator.
 *
 * Pure and dependency-free so the same data drives both the in-app 'load sample
 * data' action (see seedService) and the simulated-week test suite.
 */

import type {
  ActivityLog,
  Category,
  DateKey,
  Goal,
  Habit,
  HabitLog,
  StudySession,
  Subject,
  Task,
  Topic,
  UserSettings,
} from '@/types/models';
import { addDays, dateRange, todayKey } from '@/utils/date';

export interface DemoData {
  categories: Category[];
  habits: Habit[];
  habitLogs: HabitLog[];
  subjects: Subject[];
  topics: Topic[];
  tasks: Task[];
  sessions: StudySession[];
  activities: ActivityLog[];
  goals: Goal[];
  dates: DateKey[];
}

const CATEGORY_SEEDS = [
  { name: 'Study', icon: 'book', color: '#7C5CFF', kind: 'study' as const },
  { name: 'Work', icon: 'briefcase', color: '#41CFFF', kind: 'general' as const },
  { name: 'Gym', icon: 'activity', color: '#FF7A45', kind: 'activity' as const },
  { name: 'Personal', icon: 'heart', color: '#4ADE9B', kind: 'general' as const },
  { name: 'Skills', icon: 'zap', color: '#F2E85C', kind: 'general' as const },
];

const SUBJECT_SEEDS = [
  { name: 'Quantitative Methods', color: '#7C5CFF', topics: ['Probability', 'Hypothesis Testing', 'Regression', 'Time Series'] },
  { name: 'Economics', color: '#41CFFF', topics: ['Micro', 'Macro', 'Trade'] },
  { name: 'Financial Statement Analysis', color: '#4ADE9B', topics: ['Income Statement', 'Balance Sheet', 'Cash Flow'] },
  { name: 'Portfolio Management', color: '#FFBF47', topics: ['Risk & Return', 'Asset Allocation'] },
];

const HABIT_SEEDS: {
  name: string;
  icon: string;
  measurementType: Habit['measurementType'];
  target: number;
  frequency: Habit['frequency'];
  categoryIndex: number;
}[] = [
  { name: 'Gym', icon: 'activity', measurementType: 'binary', target: 1, frequency: { type: 'times_per_week', times: 4 }, categoryIndex: 2 },
  { name: 'Study', icon: 'book', measurementType: 'duration', target: 60, frequency: { type: 'daily' }, categoryIndex: 0 },
  { name: 'Excel Practice', icon: 'trending-up', measurementType: 'duration', target: 20, frequency: { type: 'specific_days', daysOfWeek: [1, 3, 5] }, categoryIndex: 4 },
  { name: 'No Zero Day', icon: 'zap', measurementType: 'binary', target: 1, frequency: { type: 'daily' }, categoryIndex: 3 },
  { name: 'Family Time', icon: 'heart', measurementType: 'binary', target: 1, frequency: { type: 'daily' }, categoryIndex: 3 },
];

const TASK_SEEDS: { title: string; categoryIndex: number; minutes: number }[] = [
  { title: 'Probability Practice', categoryIndex: 0, minutes: 60 },
  { title: 'Complete Economics Notes', categoryIndex: 0, minutes: 45 },
  { title: 'Push Workout', categoryIndex: 2, minutes: 55 },
  { title: 'Finish Client UI', categoryIndex: 1, minutes: 90 },
  { title: 'Practice Excel Modelling', categoryIndex: 4, minutes: 30 },
  { title: 'Weekly planning', categoryIndex: 3, minutes: 20 },
  { title: 'Review pull requests', categoryIndex: 1, minutes: 40 },
];

/** Deterministic pseudo-random so a seeded week is reproducible in tests. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export function buildDemoWeek(
  uid: string,
  options: { endDate?: DateKey; days?: number; seed?: number } = {},
): DemoData {
  const endDate = options.endDate ?? todayKey();
  const days = options.days ?? 7;
  const startDate = addDays(endDate, -(days - 1));
  const dates = dateRange(startDate, endDate);
  const random = rng(options.seed ?? 20260809);
  const now = Date.now();

  const categories: Category[] = CATEGORY_SEEDS.map((seed, index) => ({
    id: `demo_cat_${index}`,
    userId: uid,
    name: seed.name,
    icon: seed.icon,
    color: seed.color,
    order: index,
    active: true,
    kind: seed.kind,
    createdAt: now,
  }));

  const subjects: Subject[] = SUBJECT_SEEDS.map((seed, index) => ({
    id: `demo_subject_${index}`,
    userId: uid,
    name: seed.name,
    categoryId: categories[0].id,
    description: null,
    color: seed.color,
    icon: 'book',
    targetDate: addDays(endDate, 45),
    examDate: index === 0 ? addDays(endDate, 60) : null,
    order: index,
    createdAt: now,
  }));

  const topics: Topic[] = [];
  SUBJECT_SEEDS.forEach((seed, subjectIndex) => {
    seed.topics.forEach((name, topicIndex) => {
      const completed = subjectIndex === 0 ? topicIndex < 2 : topicIndex < 1;
      topics.push({
        id: `demo_topic_${subjectIndex}_${topicIndex}`,
        userId: uid,
        subjectId: subjects[subjectIndex].id,
        name,
        description: null,
        status: completed ? 'completed' : topicIndex === 2 ? 'practice' : 'learning',
        progress: 0,
        estimatedMinutes: 180,
        actualMinutes: completed ? 140 : 45,
        confidence: completed ? 4 : 3,
        lastStudiedAt: now,
        nextRevisionDate: completed ? addDays(endDate, 7) : null,
        order: topicIndex,
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  const habits: Habit[] = HABIT_SEEDS.map((seed, index) => ({
    id: `demo_habit_${index}`,
    userId: uid,
    name: seed.name,
    categoryId: categories[seed.categoryIndex].id,
    icon: seed.icon,
    color: categories[seed.categoryIndex].color,
    measurementType: seed.measurementType,
    target: seed.target,
    unit: seed.measurementType === 'duration' ? 'min' : null,
    frequency: seed.frequency,
    startDate,
    reminderTime: null,
    notificationId: null,
    active: true,
    order: index,
    createdAt: now,
    archivedAt: null,
  }));

  const tasks: Task[] = [];
  const habitLogs: HabitLog[] = [];
  const sessions: StudySession[] = [];
  const activities: ActivityLog[] = [];

  dates.forEach((date, dayIndex) => {
    const isToday = date === endDate;
    // Three to four tasks a day, most of them finished.
    const count = 3 + (dayIndex % 2);
    for (let i = 0; i < count; i += 1) {
      const seed = TASK_SEEDS[(dayIndex * 3 + i) % TASK_SEEDS.length];
      const completed = isToday ? i < count - 1 : random() > 0.22;
      tasks.push({
        id: `demo_task_${date}_${i}`,
        userId: uid,
        title: seed.title,
        description: null,
        categoryId: categories[seed.categoryIndex].id,
        goalId: null,
        scheduledDate: date,
        startTime: ['08:30', '12:00', '17:00', '19:30'][i % 4],
        endTime: null,
        estimatedMinutes: seed.minutes,
        actualMinutes: completed ? seed.minutes + Math.round((random() - 0.5) * 20) : null,
        priority: i === 0 ? 'high' : 'medium',
        status: completed ? 'completed' : 'not_started',
        isTopPriority: i === 0,
        topPriorityOrder: i === 0 ? i : null,
        recurrenceRule: null,
        parentRecurringTaskId: null,
        isRecurringTemplate: false,
        subtasks: [],
        notes: null,
        reminderMinutesBefore: null,
        notificationId: null,
        carryCount: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: completed ? now : null,
      });
    }

    habits.forEach((habit, habitIndex) => {
      // Gym lands four times a week; the daily habits mostly hold.
      const chance = habit.name === 'Gym' ? 0.55 : habit.name === 'Family Time' ? 0.7 : 0.85;
      if (random() > chance) return;
      habitLogs.push({
        id: `${habit.id}_${date}`,
        userId: uid,
        habitId: habit.id,
        date,
        value: habit.target,
        status: 'completed',
        notes: null,
        completedAt: now - (dates.length - dayIndex) * 86_400_000 + habitIndex * 1000,
      });
    });

    const studyMinutes = 45 + Math.round(random() * 60);
    const topic = topics[(dayIndex * 2) % topics.length];
    sessions.push({
      id: `demo_session_${date}`,
      userId: uid,
      subjectId: topic.subjectId,
      topicId: topic.id,
      categoryId: categories[0].id,
      taskId: null,
      label: topic.name,
      date,
      startedAt: now,
      endedAt: now + studyMinutes * 60_000,
      durationMinutes: studyMinutes,
      productivityRating: 3 + Math.round(random()),
      notes: null,
      createdAt: now,
    });

    if (habitLogs.some((l) => l.date === date && l.habitId === habits[0].id)) {
      activities.push({
        id: `demo_activity_${date}`,
        userId: uid,
        date,
        type: 'gym',
        label: ['Push', 'Pull', 'Legs', 'Upper'][dayIndex % 4],
        durationMinutes: 50 + Math.round(random() * 20),
        completed: true,
        notes: null,
        createdAt: now,
      });
    }
  });

  const goals: Goal[] = [
    {
      id: 'demo_goal_0',
      userId: uid,
      title: 'Complete the Quant syllabus',
      description: 'Finish every topic before the exam.',
      categoryId: categories[0].id,
      startDate,
      targetDate: addDays(endDate, 45),
      status: 'active',
      progressType: 'topics',
      targetValue: null,
      currentValue: 0,
      progress: 0,
      linkedHabitIds: [],
      linkedSubjectIds: [subjects[0].id],
      milestones: [
        { id: 'ms1', title: 'Finish Probability', done: true },
        { id: 'ms2', title: 'Finish Regression', done: false },
      ],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'demo_goal_1',
      userId: uid,
      title: 'Gym four times a week',
      description: null,
      categoryId: categories[2].id,
      startDate,
      targetDate: null,
      status: 'active',
      progressType: 'habits',
      targetValue: null,
      currentValue: 0,
      progress: 0,
      linkedHabitIds: [habits[0].id],
      linkedSubjectIds: [],
      milestones: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
  ];

  return { categories, habits, habitLogs, subjects, topics, tasks, sessions, activities, goals, dates };
}

/** Default settings used when scoring the demo week in tests. */
export const DEMO_SETTINGS: UserSettings = {
  weekStart: 1,
  use24HourTime: false,
  productivityThreshold: 60,
  autoCarryTasks: false,
  dailyFocusGoalMinutes: 120,
  weeklyReviewDay: 0,
  notifications: {
    enabled: false,
    taskReminders: false,
    habitReminders: false,
    studyReminders: false,
    goalDeadlines: false,
    dailyPlanning: false,
    dailyReview: false,
    weeklyReview: false,
    planningTime: '08:00',
    reviewTime: '21:30',
    taskLeadMinutes: 15,
  },
};
