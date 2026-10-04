import {
  AlarmClock, Check, Clock3, EyeOff, FileText, Hourglass, Pencil, X, type LucideIcon,
} from 'lucide-react';

import { reviewSla, slaLabel } from '@/lib/admin-labels';
import { timeAgo, type Lang, type T } from '@/lib/i18n';

/**
 * Words, colours and links for a family's stage (app.family_stages()), shared
 * by the admin home and User management's profiles so a family is described
 * the same way wherever an admin meets it.
 */
export type StagedRow = {
  stage: string | null;
  application_id: string | null;
  revision_id: string | null;
  published_revision_id: string | null;
  submitted_at: string | null;
  review_due_at: string | null;
  overdue: boolean | null;
  revision_submitted_at: string | null;
};

/** The stages that are about the registration, where its facts matter. */
export function identityStage(stage: string | null) {
  return stage === 'identity_review' || stage === 'identity_fix' || stage === 'not_sent';
}

/** The page that needs the admin for this family. */
export function rowHref(row: StagedRow) {
  switch (row.stage) {
    case 'biodata_review':
    case 'biodata_fix':
    case 'biodata_rejected':
      return `/admin/publication/${row.revision_id}`;
    case 'live':
    case 'hidden':
      return row.published_revision_id ? `/admin/publication/${row.published_revision_id}` : `/admin/registrations/${row.application_id}`;
    default:
      return `/admin/registrations/${row.application_id}`;
  }
}

/**
 * The one tag a row wears, in the colour of where the family stands. While a
 * registration waits on us it is the clock against the 24-hour target.
 */
export function familyTag(t: T, lang: Lang, row: StagedRow): { tone: string; Icon: LucideIcon; label: string } {
  switch (row.stage) {
    case 'identity_review': {
      const sla = reviewSla(row.submitted_at, row.review_due_at, row.overdue);
      return {
        tone: sla.state === 'overdue' ? 'bad' : sla.state === 'soon' ? 'gold' : 'ok',
        Icon: sla.state === 'overdue' ? AlarmClock : Hourglass,
        label: `${t('મંજૂરી બાકી', 'To approve')} · ${slaLabel(t, sla)}`,
      };
    }
    case 'biodata_review':
      return {
        tone: 'gold',
        Icon: FileText,
        label: `${t('બાયોડેટા મંજૂર કરવાનો', 'Biodata to approve')} · ${timeAgo(row.revision_submitted_at, lang)}`,
      };
    case 'identity_fix':
      return { tone: 'warn', Icon: Pencil, label: t('પરિવાર સુધારે છે', 'Family is fixing it') };
    case 'biodata_fix':
      return { tone: 'warn', Icon: Pencil, label: t('પરિવાર બાયોડેટા સુધારે છે', 'Family is fixing the biodata') };
    case 'not_sent':
      return { tone: 'muted', Icon: Clock3, label: t('હજી મોકલી નથી', 'Not sent yet') };
    case 'biodata_pending':
      return { tone: 'muted', Icon: Clock3, label: t('બાયોડેટા હજી મોકલ્યો નથી', 'Biodata not sent yet') };
    case 'identity_rejected':
      return { tone: 'bad', Icon: X, label: t('નામંજૂર', 'Rejected') };
    case 'biodata_rejected':
      return { tone: 'bad', Icon: X, label: t('બાયોડેટા નામંજૂર', 'Biodata rejected') };
    case 'live':
      return { tone: 'ok', Icon: Check, label: t('પ્રકાશિત', 'Live') };
    default:
      return { tone: 'muted', Icon: EyeOff, label: t('મંજૂર · છુપી', 'Approved · hidden') };
  }
}
