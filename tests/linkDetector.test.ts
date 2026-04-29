import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('link detector avoids regex lookbehind for iOS compatibility', () => {
    const source = readFileSync(join(process.cwd(), 'src/linkDetector.ts'), 'utf8');

    assert.equal(source.includes('(?<='), false);
    assert.equal(source.includes('(?<!'), false);
});
