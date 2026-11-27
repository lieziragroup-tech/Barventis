import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTION_DURATION,
  createExecutorPageVariants,
  createTabContentVariants,
  getExecutorPageDirection,
  getSegmentDirection,
  getStaggerDelay,
} from './motion';

test('motion durations stay within calm enterprise responsiveness budgets', () => {
  assert.ok(MOTION_DURATION.micro <= 0.16);
  assert.ok(MOTION_DURATION.exit <= 0.15);
  assert.ok(MOTION_DURATION.page <= 0.22);
  assert.ok(MOTION_DURATION.modal <= 0.22);
  assert.ok(MOTION_DURATION.collapse <= 0.22);
});

test('getExecutorPageDirection determines primary tab slide order accurately', () => {
  assert.equal(getExecutorPageDirection('home', 'jobs'), 1);
  assert.equal(getExecutorPageDirection('jobs', 'history'), 1);
  assert.equal(getExecutorPageDirection('profile', 'home'), -1);
  assert.equal(getExecutorPageDirection('history', 'jobs'), -1);
  assert.equal(getExecutorPageDirection('home', 'home'), 0);
  assert.equal(getExecutorPageDirection(null, 'home'), 0);
});

test('getExecutorPageDirection determines workflow depth push and pop accurately', () => {
  assert.equal(getExecutorPageDirection('jobs', 'task-detail'), 1);
  assert.equal(getExecutorPageDirection('task-detail', 'gps'), 1);
  assert.equal(getExecutorPageDirection('gps', 'worksheet'), 1);
  assert.equal(getExecutorPageDirection('worksheet', 'completion'), 1);
  assert.equal(getExecutorPageDirection('worksheet', 'task-detail'), -1);
  assert.equal(getExecutorPageDirection('task-detail', 'home'), -1);
});

test('createExecutorPageVariants keeps horizontal travel subtle and compositor-friendly', () => {
  const forward = createExecutorPageVariants(1);
  const backward = createExecutorPageVariants(-1);
  const neutral = createExecutorPageVariants(0);

  assert.deepEqual(forward.initial, { opacity: 0, x: 10, y: 0 });
  assert.deepEqual(backward.initial, { opacity: 0, x: -10, y: 0 });
  assert.deepEqual(neutral.initial, { opacity: 0, x: 0, y: 6 });
});

test('getStaggerDelay caps delay for long lists so lower items stay responsive', () => {
  assert.equal(getStaggerDelay(0), 0);
  assert.equal(getStaggerDelay(1), 0.022);
  assert.equal(getStaggerDelay(3), 0.066);
  assert.equal(getStaggerDelay(6), 0.132);
  assert.equal(getStaggerDelay(50), 0.132);
});

test('getSegmentDirection calculates left, right, and neutral directions cleanly', () => {
  const dayTabs = ['yesterday', 'today', 'tomorrow', 'all'] as const;
  assert.equal(getSegmentDirection(dayTabs, 'yesterday', 'today'), 1);
  assert.equal(getSegmentDirection(dayTabs, 'today', 'all'), 1);
  assert.equal(getSegmentDirection(dayTabs, 'all', 'yesterday'), -1);
  assert.equal(getSegmentDirection(dayTabs, 'tomorrow', 'today'), -1);
  assert.equal(getSegmentDirection(dayTabs, 'today', 'today'), 0);
  assert.equal(getSegmentDirection(dayTabs, null, 'today'), 0);
  assert.equal(getSegmentDirection(dayTabs, 'unknown', 'today'), 0);
});

test('createTabContentVariants produces calm directional horizontal transitions', () => {
  const forward = createTabContentVariants(1);
  const backward = createTabContentVariants(-1);
  const neutral = createTabContentVariants(0);

  assert.deepEqual(forward.initial, { opacity: 0, x: 12, y: 0 });
  assert.deepEqual(backward.initial, { opacity: 0, x: -12, y: 0 });
  assert.deepEqual(neutral.initial, { opacity: 0, x: 0, y: 4 });
});
