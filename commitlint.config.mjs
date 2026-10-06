/** Conventional Commits — see docs/workflow.md */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'admin',
        'api',
        'ui',
        'tokens',
        'types',
        'utils',
        'config',
        'docker',
        'docs',
        'repo',
        'deps',
      ],
    ],
  },
};
