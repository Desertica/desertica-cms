import type { StrapiApp } from '@strapi/strapi/admin';
import lockup from './extensions/lockup.svg';
import mark from './extensions/logo.svg';

/**
 * Admin panel: Spanish interface and the Desertica look (olive green from the website palette).
 * Each person picks the language in Profile > Interface language; "es" is enabled here.
 * The colors only affect the panel, not the website (that is "Sitio — Colores y estilo").
 */
export default {
  config: {
    locales: ['es'],
    auth: { logo: lockup },
    menu: { logo: mark },
    head: { favicon: mark },
    tutorials: false,
    notifications: { releases: false },
    theme: {
      light: {
        colors: {
          primary100: '#eef1e6',
          primary200: '#d4dcc2',
          primary500: '#7b8f59',
          primary600: '#5a6b3e',
          primary700: '#46542f',
          buttonPrimary500: '#7b8f59',
          buttonPrimary600: '#5a6b3e',
        },
      },
      dark: {
        colors: {
          primary100: '#222316',
          primary200: '#2f2e23',
          primary500: '#7b8f59',
          primary600: '#7b8f59',
          primary700: '#a3b57f',
          buttonPrimary500: '#7b8f59',
          buttonPrimary600: '#5a6b3e',
        },
      },
    },
  },
  bootstrap(_app: StrapiApp) {},
};
