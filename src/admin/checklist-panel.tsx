import { Box, Flex, Typography } from '@strapi/design-system';
import { Check, Cross } from '@strapi/icons';
import { unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';
import { GAP_LABELS, tourGaps } from '../tour-gaps';

/** Side panel of the tour editor: what is still missing, from the values on screen. Visual only, it never blocks publishing. */
const ChecklistPanel = () => {
  const { model, form } = useContentManagerContext();
  if (model !== 'api::tour.tour') return null;

  const missing = new Set(tourGaps((form as { values: Record<string, unknown> }).values));
  return {
    title: 'Antes de publicar',
    content: (
      <Flex direction="column" alignItems="stretch" gap={2}>
        {Object.entries(GAP_LABELS).map(([gap, label]) => (
          <Flex key={gap} gap={2}>
            {missing.has(gap as keyof typeof GAP_LABELS) ? <Cross fill="danger600" /> : <Check fill="success600" />}
            <Typography variant="omega" textColor={missing.has(gap as keyof typeof GAP_LABELS) ? 'danger600' : 'neutral800'}>
              {label}
            </Typography>
          </Flex>
        ))}
        <Box>
          <Typography variant="pi" textColor="neutral600">
            Es una guía: puedes publicar aunque falte algo.
          </Typography>
        </Box>
      </Flex>
    ),
  };
};

export default ChecklistPanel;
