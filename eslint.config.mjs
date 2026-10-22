import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', '.strapi/', '.tmp/', 'node_modules/', 'public/'] },
  ...tseslint.configs.recommended,
  // Fallan en codigo existente (81 y 3 al crear esta config): warn hasta limpiarlos; subir a error despues.
  { rules: { '@typescript-eslint/no-explicit-any': 'warn', '@typescript-eslint/no-unused-vars': 'warn' } },
);
