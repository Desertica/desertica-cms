import type { StrapiApp } from '@strapi/strapi/admin';
import lockup from './extensions/lockup.svg';
import mark from './extensions/logo.svg';
import { Mail, File, Image } from '@strapi/icons';
import TranslatePanel from './translate-panel';

// Strapi follows the operating system for the theme (its dark theme has a purple tint) and starts in English. Once
// per browser the panel is set to light and Spanish; what the person picks afterwards in Profile is kept.
try {
  if (!localStorage.getItem('desertica-admin-defaults')) {
    localStorage.setItem('STRAPI_THEME', 'light');
    localStorage.setItem('strapi-admin-language', 'es');
    localStorage.setItem('desertica-admin-defaults', '1');
  }
} catch {
  // storage blocked: Strapi falls back to the system theme and English
}

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
  // `widgets` is only reachable from register(); the bootstrap hook of the app does not receive it.
  register(app: StrapiApp) {
    // Home widgets: each one is hidden for people who cannot read that content (the Editor has no inbox).
    const read = (subject: string) => [{ action: 'plugin::content-manager.explorer.read', subject }];
    const widget = (id: string, title: string, icon: typeof Mail, subject: string, component: 'InboxWidget' | 'LegalWidget' | 'ToursWidget', link: { label: string; href: string }) => ({
      id,
      pluginId: 'desertica',
      icon,
      title: { id: `desertica.widget.${id}`, defaultMessage: title },
      link: { label: { id: `desertica.widget.${id}.link`, defaultMessage: link.label }, href: link.href },
      permissions: read(subject),
      component: async () => (await import('./widgets'))[component],
    });
    app.widgets.register([
      widget('inbox', 'Bandeja', Mail, 'api::reservation.reservation', 'InboxWidget', { label: 'Abrir bandeja', href: '/content-manager/collection-types/api::reservation.reservation' }),
      widget('legal-drafts', 'Páginas legales por publicar', File, 'api::page.page', 'LegalWidget', { label: 'Ver páginas', href: '/content-manager/collection-types/api::page.page' }),
      widget('tour-gaps', 'Tours sin foto o sin descargo', Image, 'api::tour.tour', 'ToursWidget', { label: 'Ver tours', href: '/content-manager/collection-types/api::tour.tour' }),
    ]);
  },
  bootstrap(app: StrapiApp) {
    (app.getPlugin('content-manager') as any).apis.addEditViewSidePanel([TranslatePanel]);
  },
};
