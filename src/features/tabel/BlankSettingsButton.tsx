import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { findExecutiveBranchId } from '@/auth/branchHelpers'
import { useBranchDetail } from './useTabel'
import { BranchBlankModal } from './BranchBlankModal'

/**
 * «Sozlash» — the blank editor, opened where the documents are actually made.
 *
 * The chancellery and HR live on the letters and decrees screens, so that is
 * where the letterhead has to be reachable from; making them go looking for it
 * in the timesheet settings is how a setting nobody finds gets built. It edits
 * the branch chosen in the header, and appears only for the people the server
 * would let save it (`assert_branch_admin`): master admin, HR, chancellery.
 */
export function BlankSettingsButton() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const branches = useBranchStore((s) => s.branches)
  const [open, setOpen] = useState(false)
  // ⚠️ NOT the header's copy. That list is `?slim=true` and has no
  // `document_templates` at all, so reading the blank out of it would show an
  // empty form and then SAVE that emptiness over a configured letterhead.
  // Fetched only once the modal is actually opened.
  const { branch } = useBranchDetail(branchId, open)

  // No branch chosen ("Barcha filiallar") means there is no single blank to
  // edit — the button waits rather than guessing which branch is meant.
  if (!branchId) return null

  // Same predicate as the save route (`assert_branch_admin`): a chancellery
  // ROLE alone used to pass here and got 404 on save — the right is a
  // `chancellery` LEADER row for this very branch.
  if (!roles.canAdministerBranch(user, branchId, { execBranchId: findExecutiveBranchId(branches) })) return null

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<Settings2 size={15} />}
        onClick={() => setOpen(true)}
        title={t('blank.settingsHint')}
      >
        {t('blank.settings')}
      </Button>
      {open && branch && <BranchBlankModal branch={branch} onClose={() => setOpen(false)} />}
    </>
  )
}
