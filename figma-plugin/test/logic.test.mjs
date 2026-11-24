import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseFilters, buildQuery, chunkRequests, groupTargets, layerKey, parseFrameFilters, parseSeed, planTargets, textFor } from '../dist/test/logic.mjs';

const person = {
  fullName: 'Amina Hassan Farah',
  firstName: 'Amina',
  age: 34,
  city: 'Nairobi',
  country: 'Kenya',
  tagline: 'Tea first, then everything else.',
  ethnicity: 'Somali',
  religion: { name: 'Muslim' },
  career: { title: 'Nurse', company: null },
  contact: { email: 'amina@example.com', phone: '+254 700 000 000' },
  avatar: { sizes: { png: '/a.png' } }
};

test('parses [filters] from a layer name, case-insensitively, ignoring unknown keys', () => {
  assert.deepEqual(parseFrameFilters('Card [Gender=female, continent = Africa, colour=red, minage=30]'), { gender: 'female', continent: 'Africa', minAge: '30' });
  assert.deepEqual(parseFrameFilters('Card'), {});
  assert.deepEqual(parseFrameFilters('Card [broken]'), {});
});

test('layerKey strips the filter suffix', () => {
  assert.equal(layerKey('#name [gender=male]'), '#name');
  assert.equal(layerKey('#avatar'), '#avatar');
});

test('baseFilters keeps only filled UI fields', () => {
  assert.deepEqual(baseFilters({ type: 'fill', gender: 'male', continent: '', minAge: ' 25 ', maxAge: '' }), { gender: 'male', minAge: '25' });
});

test('buildQuery encodes and orders keys', () => {
  assert.equal(buildQuery({ continent: 'North America', gender: 'female' }, 3, 7), 'count=3&seed=7&continent=North%20America&gender=female');
  assert.equal(buildQuery({}, 1), 'count=1');
});

test('chunkRequests splits >50 with seed, seed+1…', () => {
  assert.deepEqual(chunkRequests(120, 5), [{ count: 50, seed: 5 }, { count: 50, seed: 6 }, { count: 20, seed: 7 }]);
  assert.deepEqual(chunkRequests(3), [{ count: 3, seed: undefined }]);
});

test('parseSeed accepts non-negative integers only', () => {
  assert.equal(parseSeed('4'), 4);
  assert.equal(parseSeed(''), undefined);
  assert.equal(parseSeed('-1'), undefined);
  assert.equal(parseSeed('1.5'), undefined);
});

test('a single frame with same-named children is a repeat grid', () => {
  const grid = { name: 'List [country=Kenya]', children: [{ name: 'Row' }, { name: 'Row' }, { name: 'Row' }] };
  const targets = planTargets([grid]);
  assert.equal(targets.length, 3);
  assert.deepEqual(targets[0].inherited, { country: 'Kenya' });

  assert.equal(planTargets([{ name: 'Card', children: [{ name: '#name' }, { name: '#avatar' }] }]).length, 1);
  assert.equal(planTargets([{ name: 'A' }, { name: 'B' }]).length, 2);
});

test('groups by effective filters: UI < parent < own name', () => {
  const nodes = [{ name: 'Card' }, { name: 'Card [gender=male]' }, { name: 'Card' }, { name: 'Card [gender=male]' }];
  const groups = groupTargets(nodes.map((node) => ({ node, inherited: { country: 'Kenya' } })), { gender: 'female', country: 'Somalia' });
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].filters, { gender: 'female', country: 'Kenya' });
  assert.equal(groups[0].nodes.length, 2);
  assert.deepEqual(groups[1].filters, { gender: 'male', country: 'Kenya' });
});

test('textFor fills every layer, with sensible fallbacks', () => {
  const t = textFor(person);
  assert.equal(t['#last'], 'Hassan Farah');
  assert.equal(t['#initials'], 'AH');
  assert.equal(t['#company'], '');
  assert.equal(t['#title'], 'Nurse');
  assert.equal(t['#phone'], '+254 700 000 000');
  assert.equal(t['#bio'], person.tagline);
  assert.equal(textFor({ ...person, bio: 'Nurse and poet.' })['#bio'], 'Nurse and poet.');
  assert.equal(textFor({ ...person, lastName: 'Farah', avatar: { initials: 'AF', sizes: { png: '' } } })['#last'], 'Farah');
});
