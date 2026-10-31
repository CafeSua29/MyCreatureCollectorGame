import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },

  // ---------- Quy tắc code sạch (xem CLAUDE.md) ----------

  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Áp cho cả test: kiểm tra null rõ ràng thay vì dùng `!`.
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      // Dòng tóm tắt dữ liệu ở main được phép, có eslint-disable kèm lý do tại chỗ.
      'no-console': 'error'
    }
  },
  // switch trên union phải xử lý đủ nhánh: cần lint có thông tin kiểu (tsconfig của project).
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/simulate/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.web.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true }
      ]
    }
  },

  // Số lớn: chỉ src/core/shared/big.ts được import decimal.js (một điểm phụ thuộc duy nhất).
  // Dùng rule của typescript-eslint (khác tên) để không đè các luật no-restricted-imports bên dưới.
  {
    files: ['**/*.{ts,tsx,mts}'],
    ignores: ['src/core/shared/big.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'decimal.js',
              message: "Dùng Decimal qua '../shared' (trong core) hoặc '@core' (ngoài core)."
            }
          ]
        }
      ]
    }
  },

  // ---------- Ranh giới kiến trúc (xem CLAUDE.md) ----------

  // Core là hàm thuần: không React / Electron / Node, không nguồn ngẫu nhiên hay thời gian
  // ngoài RNG có seed (quy tắc 1, 2). Code core (không phải test) không phụ thuộc JSON dữ liệu.
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts', 'src/core/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...['react', 'react-dom', 'electron', 'fs', 'path', 'os', 'child_process'].map(
              (name) => ({
                name,
                message: 'Core là hàm thuần: không import React / Electron / Node.'
              })
            ),
            {
              name: '@data',
              message: 'Core nhận GameData qua tham số, không import JSON trực tiếp.'
            }
          ],
          patterns: [
            {
              group: ['node:*', 'react/*', 'electron/*', '@electron-toolkit/*'],
              message: 'Core là hàm thuần: không import React / Electron / Node.'
            },
            {
              group: ['@core', '@core/*'],
              message: 'Trong core dùng import tương đối (./file hoặc ../folder).'
            }
          ]
        }
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Dùng RNG có seed (src/core/shared/rng.ts).'
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Core không đọc thời gian thật; nhận qua tham số.'
        }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Core không đọc thời gian thật; nhận qua tham số.'
        }
      ]
    }
  },

  // Bên ngoài core (main, preload, renderer, data, script mô phỏng) chỉ dùng API công khai '@core';
  // không import sâu vào folder của core. '@core/testing' chỉ dùng trong file test.
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/renderer/**/*.{ts,tsx}',
      'src/data/**/*.ts',
      'scripts/simulate/**/*.ts'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core', '**/core/**'],
              message: "Import core qua '@core', không dùng đường dẫn tương đối."
            },
            {
              group: ['@core/*', '!@core/testing'],
              message: "Chỉ dùng API công khai '@core' (src/core/index.ts)."
            }
          ]
        }
      ]
    }
  },
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/renderer/**/*.{ts,tsx}',
      'src/data/**/*.ts',
      'scripts/simulate/**/*.ts'
    ],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core', '**/core/**'],
              message: "Import core qua '@core', không dùng đường dẫn tương đối."
            },
            {
              group: ['@core/*'],
              message: "Chỉ dùng API công khai '@core'; '@core/testing' chỉ dùng trong test."
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
)
