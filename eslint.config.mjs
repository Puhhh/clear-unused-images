import tsparser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
    {
        ignores: ['main.js', '.obsidian/**', 'node_modules/**'],
    },
    ...obsidianmd.configs.recommended,
    {
        files: ['src/**/*.ts', 'tests/**/*.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: './tsconfig.json',
            },
        },
        rules: {
            'obsidianmd/sample-names': 'off',
        },
    },
]);