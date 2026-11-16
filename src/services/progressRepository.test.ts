import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageProgressRepository } from './progressRepository.ts';
import { createInitialProgressState } from '../engine/progression.ts';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  const mockWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  };
  (globalThis as unknown as { window: typeof mockWindow }).window = mockWindow;
  return store;
}

describe('LocalStorageProgressRepository', () => {
  it('saves, loads, reports stored progress, and resets cleanly', () => {
    installMockLocalStorage();
    const repo = new LocalStorageProgressRepository('test_progress_key', 'Explorer', 'guest-1');

    assert.equal(repo.hasStoredProgress(), false);
    const initial = repo.load();
    assert.equal(initial.totalXp, 0);
    assert.equal(initial.learnerId, 'guest-1');

    const updated = {
      ...createInitialProgressState('Explorer'),
      learnerId: 'guest-1',
      totalXp: 90,
      completedMissionIds: ['grammar-vault-01'],
    };
    repo.save(updated);

    assert.equal(repo.hasStoredProgress(), true);
    const loaded = repo.load();
    assert.equal(loaded.totalXp, 90);
    assert.deepEqual(loaded.completedMissionIds, ['grammar-vault-01']);

    const reset = repo.reset();
    assert.equal(reset.totalXp, 0);
    assert.equal(repo.hasStoredProgress(), false);
  });

  it('recovers gracefully from malformed JSON in localStorage', () => {
    const store = installMockLocalStorage();
    store.set('corrupt_key', '{not-valid-json');
    const repo = new LocalStorageProgressRepository('corrupt_key', 'Explorer', 'guest-2');

    const loaded = repo.load();
    assert.equal(loaded.totalXp, 0);
    assert.equal(loaded.learnerId, 'guest-2');
    assert.equal(repo.hasStoredProgress(), false);
  });
});
