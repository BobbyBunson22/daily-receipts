import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['.next/**', 'node_modules/**', 'prototype/**', 'voice/**', 'scripts/make-icons.cjs'] },
];

export default config;
