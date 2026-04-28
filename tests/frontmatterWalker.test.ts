import test from 'node:test';
import assert from 'node:assert/strict';

import { walkFrontmatterValues } from '../src/frontmatterWalker.ts';

test('walkFrontmatterValues visits strings inside arrays and nested objects', () => {
    const visited: string[] = [];

    walkFrontmatterValues(
        {
            cover: 'assets/photo.png',
            attachments: ['docs/report.pdf', { nested: 'audio/song.mp3' }],
            ignored: 42,
        },
        (value) => visited.push(value)
    );

    assert.deepEqual(visited, ['assets/photo.png', 'docs/report.pdf', 'audio/song.mp3']);
});
