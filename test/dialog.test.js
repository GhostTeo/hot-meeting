import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreDialogFocus, trapDialogFocus } from '../js/ui/dialog.js';

function focusable(document) {
  return {
    focusCount: 0,
    focus() {
      this.focusCount += 1;
      document.activeElement = this;
    }
  };
}

test('il dialogo intrappola Tab e Shift+Tab e gestisce Escape', () => {
  const document = { activeElement: null };
  const first = focusable(document);
  const middle = focusable(document);
  const last = focusable(document);
  let keydown;
  let dismissals = 0;
  const container = {
    ownerDocument: document,
    querySelectorAll: () => [first, middle, last],
    addEventListener: (type, listener) => { if (type === 'keydown') keydown = listener; },
    removeEventListener: (type, listener) => {
      if (type === 'keydown' && keydown === listener) keydown = null;
    }
  };
  const event = (key, shiftKey = false) => ({
    key,
    shiftKey,
    prevented: false,
    preventDefault() { this.prevented = true; }
  });

  const release = trapDialogFocus(container, () => { dismissals += 1; });
  assert.equal(document.activeElement, first);

  last.focus();
  const forward = event('Tab');
  keydown(forward);
  assert.equal(forward.prevented, true);
  assert.equal(document.activeElement, first);

  first.focus();
  const backward = event('Tab', true);
  keydown(backward);
  assert.equal(backward.prevented, true);
  assert.equal(document.activeElement, last);

  const escape = event('Escape');
  keydown(escape);
  assert.equal(escape.prevented, true);
  assert.equal(dismissals, 1);

  release();
  assert.equal(keydown, null);
});

test('dopo il re-render il focus torna al controllo che ha aperto il dialogo', () => {
  const trigger = { focusCount: 0, focus() { this.focusCount += 1; } };
  const root = { querySelector: selector => selector === '.service-action[data-shift="dinner"]' ? trigger : null };

  assert.equal(restoreDialogFocus('.service-action[data-shift="dinner"]', root), true);
  assert.equal(trigger.focusCount, 1);
});
