import { describe, expect, it } from 'vitest';
import { shouldHandleEvent } from './shortcuts';

function keyEvent(target: Partial<HTMLElement>, key = 'n', metaKey = false) {
  return { target, key, metaKey, ctrlKey: false } as KeyboardEvent;
}

describe('shouldHandleEvent', () => {
  it('ignores typing shortcuts inside inputs', () => {
    expect(shouldHandleEvent(keyEvent({ tagName: 'INPUT' }))).toBe(false);
  });

  it('allows command palette inside inputs', () => {
    expect(shouldHandleEvent(keyEvent({ tagName: 'INPUT' }, 'k', true))).toBe(true);
  });
});
