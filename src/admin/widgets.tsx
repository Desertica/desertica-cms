import { useEffect, useState } from 'react';
import { Flex, Link as DsLink, Typography } from '@strapi/design-system';
import { Widget } from '@strapi/admin/strapi-admin';
import { useFetchClient } from '@strapi/strapi/admin';
import { NavLink } from 'react-router-dom';
import { GAP_LABELS } from '../tour-gaps';

type Overview = {
  inbox?: { reservations: number; messages: number };
  legalDrafts?: { locale: string; slugs: string[] }[];
  tours?: { documentId: string; locale: string; title: string; gaps: (keyof typeof GAP_LABELS)[] }[];
};

const PAGE_NAMES: Record<string, string> = {
  terms: 'Términos y condiciones',
  privacy: 'Privacidad',
  complaints: 'Libro de reclamaciones',
  conduct: 'Código de conducta',
  'legal-mincetur': 'Mincetur',
  cancellation: 'Cancelación y reembolso',
  cookies: 'Cookies',
};
const LANGUAGE: Record<string, string> = { es: 'español', en: 'inglés' };

/** Loads the read-only summary once per widget; the server only fills what this person may read. */
const useOverview = () => {
  const { get } = useFetchClient();
  const [state, setState] = useState<{ data?: Overview; failed?: boolean }>({});
  useEffect(() => {
    get('/desertica/overview').then(
      ({ data }) => setState({ data: (data as { data: Overview }).data }),
      () => setState({ failed: true }),
    );
  }, []);
  return state;
};

const Rows = ({ rows, empty }: { rows: { key: string; to?: string; text: string }[]; empty: string }) =>
  rows.length === 0 ? (
    <Widget.NoData>{empty}</Widget.NoData>
  ) : (
    <Flex direction="column" alignItems="stretch" gap={2}>
      {rows.map(({ key, to, text }) => (
        <Typography key={key} variant="omega" textColor="neutral800">
          {to ? <DsLink tag={NavLink} to={to}>{text}</DsLink> : text}
        </Typography>
      ))}
    </Flex>
  );

const view = (render: (data: Overview) => JSX.Element) => () => {
  const { data, failed } = useOverview();
  if (failed) return <Widget.Error />;
  if (!data) return <Widget.Loading />;
  return render(data);
};

export const InboxWidget = view(({ inbox }) => (
  <Rows
    empty="Nada pendiente."
    rows={[
      ...(inbox?.reservations ? [{ key: 'r', to: '/content-manager/collection-types/api::reservation.reservation', text: `${inbox.reservations} solicitud(es) de reserva pendientes` }] : []),
      ...(inbox?.messages ? [{ key: 'm', to: '/content-manager/collection-types/api::contact-message.contact-message', text: `${inbox.messages} mensaje(s) sin atender` }] : []),
    ]}
  />
));

export const LegalWidget = view(({ legalDrafts = [] }) => (
  <Rows
    empty="Las 7 páginas legales están publicadas."
    rows={legalDrafts.flatMap(({ locale, slugs }) =>
      slugs.map((slug) => ({ key: `${locale}${slug}`, to: `/content-manager/collection-types/api::page.page?plugins[i18n][locale]=${locale}`, text: `${PAGE_NAMES[slug]} (${LANGUAGE[locale]})` })),
    )}
  />
));

export const ToursWidget = view(({ tours = [] }) => (
  <Rows
    empty="Todos los tours tienen foto y descargo."
    rows={tours.map(({ documentId, locale, title, gaps }) => ({
      key: `${documentId}${locale}`,
      to: `/content-manager/collection-types/api::tour.tour/${documentId}?plugins[i18n][locale]=${locale}`,
      text: `${title} (${LANGUAGE[locale]}): falta ${gaps.map((g) => (g === 'photo' ? 'foto' : 'descargo')).join(' y ')}`,
    }))}
  />
));
