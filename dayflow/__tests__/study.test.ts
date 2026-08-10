import {
  calculateRevisionCompletion,
  calculateStudyMinutes,
  calculateSubjectProgress,
  calculateTimetableAdherence,
  chapterProgress,
  evaluateSlots,
  forecastSyllabus,
  nextIncompleteChapter,
  nextRevisionOffset,
  slotOccurrences,
  splitPlannedAndExtra,
} from '@/services/analytics/study';
import type { Chapter, RevisionItem, StudySession, Subject, TimetableSlot } from '@/types/models';
import { dateRange } from '@/utils/date';

function chapter(overrides: Partial<Chapter> & { id: string; order: number }): Chapter {
  return {
    userId: 'u1',
    subjectId: 's1',
    name: overrides.id,
    description: null,
    status: 'not_started',
    progress: 0,
    confidence: null,
    totalStudyMinutes: 0,
    lastStudiedAt: null,
    completedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function session(overrides: Partial<StudySession> & { id: string; dateKey: string }): StudySession {
  return {
    userId: 'u1',
    subjectId: 's1',
    chapterId: 'c1',
    topicIds: [],
    plannedMinutes: null,
    actualMinutes: 60,
    source: 'timer',
    timetableSlotId: null,
    startedAt: 0,
    endedAt: 0,
    confidence: null,
    progressBefore: null,
    progressAfter: null,
    notes: null,
    createdAt: 0,
    ...overrides,
  };
}

const slot: TimetableSlot = {
  id: 'slot1',
  userId: 'u1',
  subjectId: 's1',
  chapterMode: 'next_incomplete',
  fixedChapterId: null,
  daysOfWeek: [1, 3],
  startTime: '19:00',
  durationMinutes: 60,
  reminderOffsetMinutes: null,
  notificationId: null,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

// 2026-08-10 Mon … 2026-08-16 Sun
const WEEK = dateRange('2026-08-10', '2026-08-16');
const TODAY = '2026-08-16';

describe('chapter progress', () => {
  it('maps status to a coarse value when no explicit progress is set', () => {
    expect(chapterProgress(chapter({ id: 'c', order: 0, status: 'not_started' }))).toBe(0);
    expect(chapterProgress(chapter({ id: 'c', order: 0, status: 'learning' }))).toBe(30);
    expect(chapterProgress(chapter({ id: 'c', order: 0, status: 'practice' }))).toBe(60);
    expect(chapterProgress(chapter({ id: 'c', order: 0, status: 'completed' }))).toBe(100);
  });

  it('prefers an explicit progress value', () => {
    expect(
      chapterProgress(chapter({ id: 'c', order: 0, status: 'learning', progress: 45 })),
    ).toBe(45);
  });

  it('always reports a completed chapter as 100 regardless of stored progress', () => {
    expect(
      chapterProgress(chapter({ id: 'c', order: 0, status: 'completed', progress: 40 })),
    ).toBe(100);
  });
});

describe('next incomplete chapter', () => {
  it('picks the chapter already in progress before an untouched one', () => {
    const chapters = [
      chapter({ id: 'c1', order: 0, status: 'completed' }),
      chapter({ id: 'c2', order: 1, status: 'learning' }),
      chapter({ id: 'c3', order: 2, status: 'not_started' }),
    ];
    expect(nextIncompleteChapter(chapters)?.id).toBe('c2');
  });

  it('falls back to the first untouched chapter in order', () => {
    const chapters = [
      chapter({ id: 'c1', order: 0, status: 'completed' }),
      chapter({ id: 'c2', order: 1, status: 'not_started' }),
    ];
    expect(nextIncompleteChapter(chapters)?.id).toBe('c2');
  });

  it('returns null once the syllabus is finished', () => {
    const chapters = [chapter({ id: 'c1', order: 0, status: 'completed' })];
    expect(nextIncompleteChapter(chapters)).toBeNull();
  });
});

describe('planned vs spontaneous study', () => {
  it('counts spontaneous study toward totals but not toward planned', () => {
    const sessions = [
      session({ id: 's1', dateKey: '2026-08-10', actualMinutes: 60, timetableSlotId: 'slot1' }),
      session({ id: 's2', dateKey: '2026-08-11', actualMinutes: 45, timetableSlotId: null }),
    ];
    const split = splitPlannedAndExtra(sessions);
    expect(split.totalMinutes).toBe(105);
    expect(split.plannedMinutes).toBe(60);
    expect(split.extraMinutes).toBe(45);
    expect(calculateStudyMinutes(sessions)).toBe(105);
  });
});

describe('timetable adherence', () => {
  it('counts only scheduled slots, and only sessions linked to them', () => {
    const occurrences = slotOccurrences([slot], WEEK);
    expect(occurrences).toHaveLength(2); // Monday + Wednesday

    const sessions = [
      // Kept the Monday slot in full.
      session({ id: 's1', dateKey: '2026-08-10', actualMinutes: 60, timetableSlotId: 'slot1' }),
      // Studied on Wednesday but not against the slot — spontaneous, not adherence.
      session({ id: 's2', dateKey: '2026-08-12', actualMinutes: 90, timetableSlotId: null }),
    ];

    const results = evaluateSlots(occurrences, sessions, TODAY);
    const adherence = calculateTimetableAdherence(results);
    expect(adherence.scheduled).toBe(2);
    expect(adherence.completed).toBe(1);
    expect(adherence.missed).toBe(1);
    expect(adherence.rate).toBe(50);
  });

  it('gives proportional credit for a partly-kept slot', () => {
    const occurrences = slotOccurrences([slot], WEEK);
    const sessions = [
      session({ id: 's1', dateKey: '2026-08-10', actualMinutes: 30, timetableSlotId: 'slot1' }),
      session({ id: 's2', dateKey: '2026-08-12', actualMinutes: 60, timetableSlotId: 'slot1' }),
    ];
    const adherence = calculateTimetableAdherence(evaluateSlots(occurrences, sessions, TODAY));
    expect(adherence.rate).toBe(75); // (0.5 + 1) / 2
    expect(adherence.partial).toBe(1);
  });

  it('never counts a slot that has not happened yet', () => {
    const occurrences = slotOccurrences([slot], WEEK);
    const results = evaluateSlots(occurrences, [], '2026-08-11');
    expect(results).toHaveLength(1); // only Monday has passed
  });

  it('names a persistently weak slot but only with enough evidence', () => {
    const twoWeeks = dateRange('2026-08-03', '2026-08-16');
    const occurrences = slotOccurrences([slot], twoWeeks);
    const adherence = calculateTimetableAdherence(
      evaluateSlots(occurrences, [], TODAY),
      () => 'Maths Monday 19:00',
    );
    expect(adherence.weakestSlot?.label).toBe('Maths Monday 19:00');
    expect(adherence.weakestSlot?.rate).toBe(0);

    const single = calculateTimetableAdherence(
      evaluateSlots(slotOccurrences([slot], dateRange('2026-08-10', '2026-08-10')), [], TODAY),
    );
    expect(single.weakestSlot).toBeNull();
  });
});

describe('subject progress', () => {
  const subject: Subject = {
    id: 's1',
    userId: 'u1',
    courseId: null,
    name: 'Maths',
    code: null,
    color: '#7C5CFF',
    icon: 'book',
    targetDate: null,
    examDate: null,
    weeklyTargetMinutes: null,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  };

  it('averages chapter progress across the syllabus', () => {
    const chapters = [
      chapter({ id: 'c1', order: 0, status: 'completed' }),
      chapter({ id: 'c2', order: 1, status: 'learning', progress: 50 }),
      chapter({ id: 'c3', order: 2, status: 'not_started' }),
    ];
    const stats = calculateSubjectProgress(subject, chapters, []);
    expect(stats.syllabusProgress).toBe(50); // (100 + 50 + 0) / 3
    expect(stats.chaptersCompleted).toBe(1);
    expect(stats.chaptersTotal).toBe(3);
  });

  it('does not infer progress from time spent', () => {
    const chapters = [chapter({ id: 'c1', order: 0, status: 'learning', totalStudyMinutes: 600 })];
    const sessions = [session({ id: 's1', dateKey: '2026-08-10', actualMinutes: 600 })];
    const stats = calculateSubjectProgress(subject, chapters, sessions);
    expect(stats.minutes).toBe(600);
    expect(stats.syllabusProgress).toBe(30); // status-derived, not time-derived
  });
});

describe('forecasting', () => {
  const chapters = [
    chapter({ id: 'c1', order: 0, status: 'completed' }),
    chapter({ id: 'c2', order: 1, status: 'learning' }),
    chapter({ id: 'c3', order: 2, status: 'not_started' }),
  ];

  it('says nothing without a target date', () => {
    expect(forecastSyllabus(chapters, null, TODAY)).toBeNull();
  });

  it('says nothing when there is nothing left to do', () => {
    const done = [chapter({ id: 'c1', order: 0, status: 'completed' })];
    expect(forecastSyllabus(done, '2026-09-16', TODAY)).toBeNull();
  });

  it('says nothing once the target date has passed', () => {
    expect(forecastSyllabus(chapters, '2026-08-01', TODAY)).toBeNull();
  });

  it('reports the pace required, and admits when the current pace is unknown', () => {
    const forecast = forecastSyllabus(chapters, '2026-09-13', TODAY);
    expect(forecast).not.toBeNull();
    expect(forecast!.remainingChapters).toBe(2);
    expect(forecast!.daysRemaining).toBe(28);
    expect(forecast!.requiredPacePerWeek).toBe(0.5);
    expect(forecast!.currentPacePerWeek).toBeNull();
    expect(forecast!.onTrack).toBeNull();
  });
});

describe('revision', () => {
  const items: RevisionItem[] = [
    {
      id: 'r1',
      userId: 'u1',
      subjectId: 's1',
      chapterId: 'c1',
      topicId: null,
      dueDateKey: '2026-08-14',
      status: 'completed',
      revisionNumber: 1,
      completedAt: 1,
      nextRevisionDateKey: '2026-08-21',
      createdAt: 0,
    },
    {
      id: 'r2',
      userId: 'u1',
      subjectId: 's1',
      chapterId: 'c2',
      topicId: null,
      dueDateKey: '2026-08-16',
      status: 'due',
      revisionNumber: 1,
      completedAt: null,
      nextRevisionDateKey: null,
      createdAt: 0,
    },
    {
      id: 'r3',
      userId: 'u1',
      subjectId: 's1',
      chapterId: 'c3',
      topicId: null,
      dueDateKey: '2026-08-12',
      status: 'due',
      revisionNumber: 1,
      completedAt: null,
      nextRevisionDateKey: null,
      createdAt: 0,
    },
    {
      id: 'r4',
      userId: 'u1',
      subjectId: 's1',
      chapterId: 'c4',
      topicId: null,
      dueDateKey: '2026-08-20',
      status: 'due',
      revisionNumber: 1,
      completedAt: null,
      nextRevisionDateKey: null,
      createdAt: 0,
    },
  ];

  it('separates due, overdue and upcoming', () => {
    const stats = calculateRevisionCompletion(items, TODAY);
    expect(stats.dueToday).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.upcoming).toBe(1);
    expect(stats.completed).toBe(1);
  });

  it('spaces repeat revisions further apart each time', () => {
    expect(nextRevisionOffset(1)).toBe(3);
    expect(nextRevisionOffset(2)).toBe(7);
    expect(nextRevisionOffset(3)).toBe(14);
    expect(nextRevisionOffset(99)).toBe(30);
  });
});
