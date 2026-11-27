import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_GUIDE_STEPS_BY_MODULE,
  AppGuideModuleId,
  getAppGuideModuleCards,
  getAppGuideStepsForScope,
  getAvailableGuideModuleIds,
  resolveGuideModuleId,
} from './appGuideSteps.ts';

test('all app guide steps across every module have unique IDs and non-empty copy', () => {
  const allSteps = Object.values(APP_GUIDE_STEPS_BY_MODULE).flat();
  assert.ok(allSteps.length >= 16, 'expected comprehensive step coverage across app modules');

  const ids = new Set<string>();
  for (const step of allSteps) {
    assert.ok(!ids.has(step.id), `duplicate step id found: ${step.id}`);
    ids.add(step.id);
    assert.ok(step.target.trim().length > 0, `empty target for ${step.id}`);
    assert.ok(step.sectionLabel.trim().length > 0, `empty sectionLabel for ${step.id}`);
    assert.ok(step.title.trim().length > 0, `empty title for ${step.id}`);
    assert.ok(step.description.trim().length > 10, `too short description for ${step.id}`);
  }
});

test('resolveGuideModuleId maps legacy and sub-tab aliases cleanly to parent module IDs', () => {
  assert.equal(resolveGuideModuleId('dashboard'), 'dashboard');
  assert.equal(resolveGuideModuleId('reports'), 'reports');
  assert.equal(resolveGuideModuleId('anomalies'), 'reports');
  assert.equal(resolveGuideModuleId('tracking'), 'tracking');
  assert.equal(resolveGuideModuleId('customers'), 'customers');
  assert.equal(resolveGuideModuleId('kontrol-rayap'), 'customers');
  assert.equal(resolveGuideModuleId('approval'), 'approval');
  assert.equal(resolveGuideModuleId('executors'), 'approval');
  assert.equal(resolveGuideModuleId('templates'), 'templates');
  assert.equal(resolveGuideModuleId('risk-config'), 'templates');
  assert.equal(resolveGuideModuleId('profile'), 'templates');
  assert.equal(resolveGuideModuleId('projects'), 'spk-cms');
  assert.equal(resolveGuideModuleId('cashflow'), 'order-tracking');
  assert.equal(resolveGuideModuleId('performa'), 'order-tracking');
  assert.equal(resolveGuideModuleId('saas-companies'), 'saas-companies');
  assert.equal(resolveGuideModuleId('unknown-tab'), 'navigation');
});

test('getAvailableGuideModuleIds includes navigation plus all admin sidebar modules in order', () => {
  const adminSidebar = ['dashboard', 'reports', 'tracking', 'customers', 'approval', 'templates'];
  const modules = getAvailableGuideModuleIds('ADMIN', adminSidebar, 'dashboard');

  assert.deepEqual(modules, [
    'navigation',
    'dashboard',
    'reports',
    'tracking',
    'customers',
    'approval',
    'templates',
  ]);
});

test('role-specific modules are always included for MARKETING, INVENTORY, and MASTER_SUPER_ADMIN', () => {
  const mktModules = getAvailableGuideModuleIds('MARKETING', [], 'quotation');
  assert.ok(mktModules.includes('navigation'));
  assert.ok(mktModules.includes('quotation'));

  const invModules = getAvailableGuideModuleIds('INVENTORY', [], 'inventory');
  assert.ok(invModules.includes('navigation'));
  assert.ok(invModules.includes('inventory'));

  const masterModules = getAvailableGuideModuleIds('MASTER_SUPER_ADMIN', [], 'saas-companies');
  assert.ok(masterModules.includes('navigation'));
  assert.ok(masterModules.includes('saas-companies'));
  assert.ok(!masterModules.includes('reports'));
});

test('getAppGuideStepsForScope returns full multi-module tour for "all" and scoped steps for single module', () => {
  const adminSidebar = ['dashboard', 'reports', 'tracking', 'customers', 'approval', 'templates'];
  const fullSteps = getAppGuideStepsForScope('all', 'SUPERADMIN', adminSidebar, 'dashboard');
  const fullModuleSet = new Set(fullSteps.map(s => s.moduleId));

  const expectedModules: AppGuideModuleId[] = [
    'navigation',
    'dashboard',
    'reports',
    'tracking',
    'customers',
    'approval',
    'templates',
  ];
  for (const mod of expectedModules) {
    assert.ok(fullModuleSet.has(mod), `full tour missing module: ${mod}`);
  }

  const reportSteps = getAppGuideStepsForScope('reports', 'SUPERADMIN', adminSidebar, 'reports');
  assert.equal(reportSteps.length, APP_GUIDE_STEPS_BY_MODULE.reports.length);
  assert.ok(reportSteps.every(s => s.moduleId === 'reports' && s.tabId === 'reports'));
});

test('getAppGuideModuleCards returns accurate step counts matching step definitions', () => {
  const adminSidebar = ['dashboard', 'reports', 'tracking', 'customers', 'approval', 'templates'];
  const cards = getAppGuideModuleCards('ADMIN', adminSidebar, 'reports');

  assert.equal(cards.length, 7);
  for (const card of cards) {
    assert.equal(card.stepCount, APP_GUIDE_STEPS_BY_MODULE[card.id].length);
    assert.ok(card.label.length > 0);
    assert.ok(card.subtitle.length > 0);
  }
});
