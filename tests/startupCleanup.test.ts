import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT,
    createVaultLoadCleanupScheduler,
} from '../src/startupCleanup.ts';

test('auto cleanup on vault load is disabled by default', () => {
    assert.equal(AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT, false);
});

test('vault load cleanup scheduler runs image cleanup once when enabled', async () => {
    const calls: Array<'image' | 'all'> = [];
    const scheduler = createVaultLoadCleanupScheduler(async (callback) => {
        await callback();
    }, async (type) => {
        calls.push(type);
    });

    await scheduler(true);
    await scheduler(true);

    assert.deepEqual(calls, ['image']);
});

test('vault load cleanup scheduler does not run when disabled', async () => {
    const calls: Array<'image' | 'all'> = [];
    const scheduler = createVaultLoadCleanupScheduler(async (callback) => {
        await callback();
    }, async (type) => {
        calls.push(type);
    });

    await scheduler(false);

    assert.deepEqual(calls, []);
});
