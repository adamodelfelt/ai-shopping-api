import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewWorkspace, initialReview, validateReview, effectiveColor } from '../public/studio-model.js';

const product = { id: '123', name: 'Prickig tröja', importedColor: 'Röd', importedColorId: 'red', currentColorId: 'burgundy', catalogueDate: '2026-10-26T12:00:00Z', url: 'https://example.com/product/123', flags: [], internalNotes: 'must not export' };
const workspace = () => createReviewWorkspace([product], { now: () => '2026-10-28T07:00:00Z' });
function positiveReview() { const review = initialReview(product); review.terms.rolig = { verdict: 'yes', strength: 2, evidence: ['dots'], note: '' }; return review; }

test('an error report preserves the current color until a correction is actually proposed', () => {
  const review = initialReview(product); review.color.verdict = 'flagged'; review.color.reason = 'wrong_shade';
  assert.equal(effectiveColor(validateReview(review), product), 'burgundy');
  review.color.verdict = 'corrected'; review.color.primary = 'brown';
  assert.equal(effectiveColor(validateReview(review), product), 'brown');
  review.color.primary = 'unknown'; assert.throws(() => validateReview(review), /huvudfärg/);
  review.color.primary = 'brown'; review.color.reason = ''; assert.throws(() => validateReview(review), /varför/);
});
test('manual tags do not require prose while unknown, explicit no and uncertain remain different', () => {
  const review = positiveReview();
  assert.equal(validateReview(review).terms.festlig.verdict, 'unreviewed');
  review.terms.rolig.evidence = []; assert.equal(validateReview(review).terms.rolig.verdict, 'yes');
  review.terms.rolig.verdict = 'no'; assert.equal(validateReview(review).terms.rolig.verdict, 'no');
  review.terms.rolig.verdict = 'uncertain'; assert.equal(validateReview(review).terms.rolig.verdict, 'uncertain');
  assert.throws(() => validateReview(initialReview(product)), /Bedöm/);
});
test('pattern and color validation catches contradictory or duplicate labels', () => {
  const review = positiveReview(); review.patternVerdict = 'confirmed'; review.patterns = ['dotted', 'solid'];
  assert.throws(() => validateReview(review), /Enfärgat/);
  review.patterns = ['dotted']; review.color.secondary = ['white', 'white']; assert.throws(() => validateReview(review), /olika/);
  review.color.secondary = []; review.terms.rolig.note = 'x'.repeat(601); assert.throws(() => validateReview(review), /bedömningen/);
});
test('approval is limited to saved proposals in the reviewer test role, with immutable revision copies', () => {
  const model = workspace(); model.update(product.id, positiveReview());
  const saved = model.save(product.id); saved.review.terms.rolig.verdict = 'no';
  assert.equal(model.record(product.id).draft.terms.rolig.verdict, 'yes');
  assert.throws(() => model.approve(product.id, 'coder'), /Granskare/);
  const edited = model.record(product.id).draft; edited.terms.rolig.strength = 3; model.update(product.id, edited);
  assert.throws(() => model.approve(product.id, 'reviewer'), /Spara/);
  model.reset(product.id); model.approve(product.id, 'reviewer');
  assert.equal(model.record(product.id).status, 'approved');
  assert.deepEqual(model.record(product.id).history.map(event => event.action), ['proposed', 'approved']);
});
test('adding a term preserves earlier definitions and pending proposals, and reset retains history', () => {
  const model = workspace(); model.update(product.id, positiveReview()); model.save(product.id);
  const term = model.addTerm('Rockig', 'Tydlig attityd i motiv och detaljer.');
  assert.equal(model.record(product.id).status, 'pending');
  assert.equal(model.record(product.id).draft.terms[term].verdict, 'unreviewed');
  assert.equal(model.record(product.id).revisions[0].definitions.some(item => item.id === term), false);
  model.approve(product.id, 'reviewer');
  const review = model.record(product.id).draft; review.terms[term].verdict = 'no'; model.update(product.id, review);
  model.reset(product.id); assert.equal(model.record(product.id).status, 'approved');
  assert.equal(model.record(product.id).history.length, 2);
  assert.throws(() => model.addTerm('Rockig', 'En ny definition för samma ord.'), /finns redan/);
});
test('export includes saved proposals only and explicitly marks them as unapplied sketch data', () => {
  const model = workspace(); model.update(product.id, positiveReview()); assert.equal(model.export().proposals.length, 0);
  model.save(product.id); model.returnForChanges(product.id, 'reviewer');
  const data = model.export();
  assert.equal(data.prototype, true); assert.equal(data.applied, false); assert.equal(data.schema, 'whool-review-sketch/1');
  assert.equal(data.proposals[0].revisions[0].status, 'changes_requested');
  assert.equal(JSON.stringify(data).includes('must not export'), false);
  assert.equal(model.record(product.id).product.currentColorId, 'burgundy');
});

test('one product retains several independent tags through saving, deselection and export', () => {
  const model = workspace(), review = initialReview(product);
  for (const id of ['rolig', 'sot', 'sportig']) review.terms[id].verdict = 'yes';
  model.update(product.id, review); model.save(product.id);
  const first = model.export().proposals[0].revisions[0].review;
  assert.deepEqual(Object.keys(first.terms).filter(id => first.terms[id].verdict === 'yes'), ['rolig', 'sot', 'sportig']);
  const changed = model.record(product.id).draft; changed.terms.sot.verdict = 'unreviewed'; model.update(product.id, changed); model.save(product.id);
  const revisions = model.export().proposals[0].revisions;
  assert.equal(revisions[0].review.terms.sot.verdict, 'yes');
  assert.equal(revisions[1].review.terms.sot.verdict, 'unreviewed');
  assert.equal(revisions[1].review.terms.rolig.verdict, 'yes');
  assert.equal(revisions[1].review.terms.sportig.verdict, 'yes');
  assert.equal(revisions[1].review.color.verdict, 'unreviewed');
});
