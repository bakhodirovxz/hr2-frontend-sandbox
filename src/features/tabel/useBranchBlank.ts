import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiPatch, apiPost } from '@/api/http'
import {
  ORGANIZATION_BRANCH_DOC_TEMPLATE,
  ORGANIZATION_BRANCH_DETAIL,
  ORGANIZATION_BRANCH_LOGO,
  ORGANIZATION_BRANCH_UPLOAD_LOGO,
} from '@/api/endpoints'

/** Which document a blank belongs to. `decree` is the buyruq. */
export type BlankDocType = 'explanatory' | 'application' | 'decree'

/**
 * One branch's BLANK for one document type.
 *
 * Every field is optional and an empty one means "as before": the generator
 * only replaces the parts the branch actually filled in, so a branch that never
 * opens this screen keeps exactly the document it has today.
 */
export interface BranchBlank {
  /** A ready .docx the branch uploaded; when present it IS the blank and the
   *  form fields below (except the title) no longer apply. */
  file?: { bucket?: string; name?: string; original?: string | null } | null
  logo?: boolean
  logo_width_cm?: number
  logo_align?: 'left' | 'center' | 'right'
  header_lines?: string[]
  title?: string
  footer?: string
  margins?: { top?: number; bottom?: number; left?: number; right?: number }
  /** Which of the standard blocks the generator prints — see `BlankBlocks`. */
  blocks?: BlankBlocks
}

/**
 * THE DATA BLOCKS THE DEFAULT TEMPLATE PRINTS.
 *
 * Every flag is "on unless explicitly off": `undefined` means the branch never
 * touched it and the block is drawn exactly as before. Only an explicit `false`
 * removes it, which is what keeps an untouched branch's documents identical.
 */
export interface BlankBlocks {
  /** Bildirgi: the number and date in the top-left corner. */
  number_date?: boolean
  /** The addressee («…ga») and author («…dan») block, top right. */
  addressee?: boolean
  /** The QR signature stamp beside the signature (verify link on a decree). */
  sign_qr?: boolean
  /** The department + position line to the left of the signature. */
  sign_position?: boolean
  /** Decree: the city on the requisites line. */
  city?: boolean
  /** Override the city wording; empty takes it from the branch's region. */
  city_text?: string
  /** Decree: the KIRITILDI / KELISHILDI / TARQATILDI section. */
  signature_section?: boolean
}

export type BranchBlanks = Partial<Record<BlankDocType, BranchBlank>>

export function useBranchBlankMutations() {
  const qc = useQueryClient()
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['tabel-branches'] })
    // The «Sozlash» button on /letters and /orders reads the single branch
    // (`useBranchDetail`); `['branches']` matched no query at all, so the
    // blank editor reopened on the pre-save template.
    void qc.invalidateQueries({ queryKey: ['organization-branch'] })
    void qc.invalidateQueries({ queryKey: ['organization-branches'] })
  }
  return {
    /**
     * ⚠️ Sends ONE document type at a time. The server merges it into whatever
     * the branch already has, so saving the bildirgi blank cannot wipe the
     * ariza one — which a whole-object PATCH would have done.
     */
    save: useMutation({
      mutationFn: ({ branchId, docType, blank }: {
        branchId: number
        docType: BlankDocType
        blank: BranchBlank
      }) => apiPatch(ORGANIZATION_BRANCH_DETAIL(branchId), { document_templates: { [docType]: blank } }),
      onSuccess: done,
    }),
    uploadLogo: useMutation({
      mutationFn: ({ branchId, file }: { branchId: number; file: File }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost(ORGANIZATION_BRANCH_UPLOAD_LOGO(branchId), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      },
      onSuccess: done,
    }),
    /** Upload a finished Word blank; the generator writes into it. */
    uploadTemplate: useMutation({
      mutationFn: ({ branchId, docType, file }: {
        branchId: number
        docType: BlankDocType
        file: File
      }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost(ORGANIZATION_BRANCH_DOC_TEMPLATE(branchId, docType), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      },
      onSuccess: done,
    }),
    removeTemplate: useMutation({
      mutationFn: ({ branchId, docType }: { branchId: number; docType: BlankDocType }) =>
        apiDelete(ORGANIZATION_BRANCH_DOC_TEMPLATE(branchId, docType)),
      onSuccess: done,
    }),
    /** Removing it falls the branch back to the shared organisation logo. */
    removeLogo: useMutation({
      mutationFn: (branchId: number) => apiDelete(ORGANIZATION_BRANCH_LOGO(branchId)),
      onSuccess: done,
    }),
  }
}
