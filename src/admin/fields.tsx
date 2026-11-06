import { Box, Button, Field, Flex, SingleSelect, SingleSelectOption, TextInput, Typography } from '@strapi/design-system';
import { useField } from '@strapi/strapi/admin';
import { parseMapLink } from '../map-url';
import { ICONS } from './icons';

type Props = { name: string; label?: string; hint?: string; required?: boolean; disabled?: boolean };

const Drawing = ({ name, size = 22 }: { name: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: ICONS[name]?.svg ?? '' }}
  />
);

/** Icon chosen by looking at it; stores the same name (`lucideCar`) the website already understands. */
export const IconPicker = ({ name, label, hint, required, disabled }: Props) => {
  const field = useField(name);
  const current = typeof field.value === 'string' ? field.value : '';
  const unknown = current && !ICONS[current];
  return (
    <Field.Root name={name} id={name} error={field.error} hint={hint} required={required}>
      <Flex direction="column" alignItems="stretch" gap={1}>
        <Field.Label>{label}</Field.Label>
        <Flex gap={2} wrap="wrap">
          {Object.keys(ICONS).map((icon) => {
            const active = current === icon;
            return (
              <button
                key={icon}
                type="button"
                disabled={disabled}
                onClick={() => field.onChange(name, icon)}
                aria-pressed={active}
                title={ICONS[icon]?.label ?? icon}
                style={{
                  width: 76,
                  padding: '10px 4px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  cursor: disabled ? 'default' : 'pointer',
                  borderRadius: 4,
                  border: `1px solid ${active ? '#5a6b3e' : '#dcdce4'}`,
                  background: active ? '#5a6b3e' : '#ffffff',
                  color: active ? '#ffffff' : '#32324d',
                }}
              >
                <Drawing name={icon} />
                <span style={{ fontSize: 12, lineHeight: 1.2 }}>{ICONS[icon]?.label ?? icon}</span>
              </button>
            );
          })}
          <Button type="button" size="L" variant="tertiary" disabled={disabled || !current} onClick={() => field.onChange(name, '')}>
            Sin icono
          </Button>
        </Flex>
        {unknown && <Typography variant="pi" textColor="danger600">{`"${current}" no es un icono de la lista: la web no lo dibuja. Elige uno.`}</Typography>}
        <Field.Hint />
        <Field.Error />
      </Flex>
    </Field.Root>
  );
};

/** Dropdown that shows a readable label and stores the fixed value the website expects. */
const choiceField = (choices: Array<[string, string]>) =>
  function ChoiceSelect({ name, label, hint, required, disabled }: Props) {
    const field = useField(name);
    return (
      <Field.Root name={name} id={name} error={field.error} hint={hint} required={required}>
        <Field.Label>{label}</Field.Label>
        <SingleSelect value={String(field.value ?? '')} onChange={(value: string | number) => field.onChange(name, value)} disabled={disabled}>
          {choices.map(([value, text]) => (
            <SingleSelectOption key={value} value={value}>
              {text}
            </SingleSelectOption>
          ))}
        </SingleSelect>
        <Field.Hint />
        <Field.Error />
      </Field.Root>
    );
  };

export const FormatSelect = choiceField([
  ['both', 'Grupal y privado'],
  ['shared', 'Solo grupal'],
  ['private', 'Solo privado'],
]);

export const FocusSelect = choiceField([
  ['center', 'Centro'],
  ['top', 'Arriba'],
  ['bottom', 'Abajo'],
  ['left', 'Izquierda'],
  ['right', 'Derecha'],
]);

/** Google Maps link with a live check and, when the link says where it points, a small map. */
export const MapLink = ({ name, label, hint, required, disabled }: Props) => {
  const field = useField(name);
  const link = parseMapLink(typeof field.value === 'string' ? field.value : '');
  return (
    <Field.Root name={name} id={name} error={field.error} hint={hint} required={required}>
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Field.Label>{label}</Field.Label>
        <TextInput
          name={name}
          value={String(field.value ?? '')}
          placeholder="https://maps.app.goo.gl/..."
          disabled={disabled}
          onChange={(event: { target: { value: string } }) => field.onChange(name, event.target.value)}
        />
        {link.kind === 'invalid' && <Typography variant="pi" textColor="danger600">Eso no parece un enlace. Pega el enlace de Google Maps completo, que empieza con https://</Typography>}
        {link.kind === 'other' && <Typography variant="pi" textColor="warning600">No se puede previsualizar aquí (no es de Google Maps o no trae coordenadas). El enlace sirve igual: ábrelo para comprobarlo.</Typography>}
        {link.kind === 'short' && <Typography variant="pi" textColor="neutral600">Enlace corto de Google Maps: no se puede previsualizar aquí. Ábrelo para comprobar que llega al punto de encuentro.</Typography>}
        {link.kind === 'place' && (
          <Box borderColor="neutral200" hasRadius overflow="hidden" height="220px">
            <iframe title="Vista previa del mapa" src={link.embed} width="100%" height="220" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin" />
          </Box>
        )}
        {(link.kind === 'place' || link.kind === 'short' || link.kind === 'other') && (
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <Typography variant="pi" textColor="primary600">Abrir en una pestaña nueva</Typography>
          </a>
        )}
        <Field.Hint />
        <Field.Error />
      </Flex>
    </Field.Root>
  );
};
