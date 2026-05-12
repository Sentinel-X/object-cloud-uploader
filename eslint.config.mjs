import { defineConfig } from 'eslint/config';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import stylistic from '@stylistic/eslint-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default defineConfig([
    {
        extends: compat.extends('eslint:recommended', 'plugin:@typescript-eslint/recommended'),

        plugins: {
            '@typescript-eslint': typescriptEslint,
            '@stylistic': stylistic,
            unicorn,
        },

        languageOptions: {
            globals: {
                ...Object.fromEntries(Object.entries(globals.browser).map(([key]) => [key, 'off'])),
                ...globals.node,
            },
            parser: tsParser,
            ecmaVersion: 2020,
            sourceType: 'module',
        },

        rules: {
            'no-console': 'off',
            'guard-for-in': 'error',
            'unicorn/no-array-for-each': 'error',
            'no-loop-func': 'error',
            'no-sync': 'error',
            'no-template-curly-in-string': 'error',
            'block-scoped-var': 'error',
            'dot-notation': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            'no-irregular-whitespace': 'error',
            'space-infix-ops': 'error',
            'space-before-blocks': 'error',
            'no-multi-spaces': 'error',
            'key-spacing': 'off',
            curly: ['error', 'all'],

            // ── Stylistic rules (moved from @typescript-eslint to @stylistic) ──
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/indent': ['error', 4, { SwitchCase: 1 }],
            '@stylistic/quotes': ['error', 'single', { allowTemplateLiterals: 'always' }],
            '@stylistic/function-call-spacing': ['error', 'never'],
            '@stylistic/type-annotation-spacing': 'error',
            '@stylistic/member-delimiter-style': ['error', {
                multiline: { delimiter: 'semi', requireLast: true },
                singleline: { delimiter: 'semi', requireLast: true },
            }],
            '@stylistic/array-bracket-spacing': ['error', 'never'],
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/brace-style': 'error',
            '@stylistic/comma-spacing': 'error',

            // ── TypeScript rules (non-stylistic, still in @typescript-eslint) ──
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/naming-convention': ['error', {
                selector: 'interface',
                format: ['PascalCase'],
            }],
            '@typescript-eslint/explicit-member-accessibility': ['error', {
                accessibility: 'explicit',
            }],
            '@typescript-eslint/class-methods-use-this': ['error', {
                ignoreOverrideMethods: true,
                ignoreClassesThatImplementAnInterface: true,
            }],
        },
    },
]);
