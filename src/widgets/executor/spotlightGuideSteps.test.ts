import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETION_GUIDE_STEPS,
  getMainGuideSectionCards,
  getSpotlightStepsForTopic,
  isContextualSubpage,
  resolveDefaultTopicForPage,
  TECH_FULL_TOUR_STEPS,
  TECH_HISTORY_GUIDE_STEPS,
  TECH_HOME_GUIDE_STEPS,
  TECH_JOBS_GUIDE_STEPS,
  TECH_PROFILE_GUIDE_STEPS,
  WORKSHEET_GUIDE_STEPS,
} from './spotlightGuideSteps';

test('full technician tour covers all four primary tabs in sequential order', () => {
  const pagesSeen: string[] = [];
  for (const step of TECH_FULL_TOUR_STEPS) {
    if (pagesSeen[pagesSeen.length - 1] !== step.page) {
      pagesSeen.push(step.page);
    }
  }
  assert.deepEqual(pagesSeen, ['home', 'jobs', 'history', 'profile']);
  assert.equal(
    TECH_FULL_TOUR_STEPS.length,
    TECH_HOME_GUIDE_STEPS.length +
      TECH_JOBS_GUIDE_STEPS.length +
      TECH_HISTORY_GUIDE_STEPS.length +
      TECH_PROFILE_GUIDE_STEPS.length
  );
});

test('all spotlight steps across main and contextual screens have unique IDs and non-empty copy', () => {
  const allSteps = [
    ...TECH_FULL_TOUR_STEPS,
    ...WORKSHEET_GUIDE_STEPS,
    ...COMPLETION_GUIDE_STEPS,
  ];
  const ids = new Set<string>();
  for (const step of allSteps) {
    assert.ok(step.id.length > 0);
    assert.ok(!ids.has(step.id), `Duplicate step id: ${step.id}`);
    ids.add(step.id);
    assert.ok(step.target.length > 0);
    assert.ok(step.sectionLabel.length > 0);
    assert.ok(step.title.trim().length > 3);
    assert.ok(step.description.trim().length > 10);
  }
});

test('worksheet and completion guides cover key features (locked form, GPS, voice, minimap, PDF)', () => {
  const worksheetTargets = WORKSHEET_GUIDE_STEPS.map(s => s.target);
  assert.deepEqual(worksheetTargets, [
    'worksheet-locked',
    'worksheet-gps',
    'worksheet-findings',
    'worksheet-voice',
    'worksheet-sign',
  ]);

  const completionTargets = COMPLETION_GUIDE_STEPS.map(s => s.target);
  assert.deepEqual(completionTargets, [
    'summary-minimap',
    'summary-docs',
    'summary-actions',
  ]);
});

test('getSpotlightStepsForTopic returns matching scoped steps for each topic', () => {
  assert.equal(getSpotlightStepsForTopic('all').length, TECH_FULL_TOUR_STEPS.length);
  assert.equal(getSpotlightStepsForTopic('home').length, TECH_HOME_GUIDE_STEPS.length);
  assert.equal(getSpotlightStepsForTopic('jobs').length, TECH_JOBS_GUIDE_STEPS.length);
  assert.equal(getSpotlightStepsForTopic('history').length, TECH_HISTORY_GUIDE_STEPS.length);
  assert.equal(getSpotlightStepsForTopic('profile').length, TECH_PROFILE_GUIDE_STEPS.length);
  assert.equal(getSpotlightStepsForTopic('worksheet').length, WORKSHEET_GUIDE_STEPS.length);
  assert.equal(getSpotlightStepsForTopic('completion').length, COMPLETION_GUIDE_STEPS.length);
});

test('resolveDefaultTopicForPage and isContextualSubpage route subpages contextually', () => {
  assert.equal(resolveDefaultTopicForPage('home'), 'all');
  assert.equal(resolveDefaultTopicForPage('jobs'), 'all');
  assert.equal(resolveDefaultTopicForPage('history'), 'all');
  assert.equal(resolveDefaultTopicForPage('profile'), 'all');
  assert.equal(resolveDefaultTopicForPage('worksheet'), 'worksheet');
  assert.equal(resolveDefaultTopicForPage('completion'), 'completion');

  assert.equal(isContextualSubpage('worksheet'), true);
  assert.equal(isContextualSubpage('completion'), true);
  assert.equal(isContextualSubpage('home'), false);
});

test('getMainGuideSectionCards accurately reflects step counts for the 4 main tabs', () => {
  const cards = getMainGuideSectionCards();
  assert.equal(cards.length, 4);
  const sum = cards.reduce((acc, c) => acc + c.stepCount, 0);
  assert.equal(sum, TECH_FULL_TOUR_STEPS.length);
});
