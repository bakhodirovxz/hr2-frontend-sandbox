import { useCallback, useEffect, useState } from 'react'

/**
 * A blob pasted from the clipboard has NO NAME — `file.name` is empty, and an
 * unnamed part makes the upload land as "blob" or get rejected outright. Give
 * it one derived from its own MIME type, the way v1 does.
 */
function named(file: File): File {
  if (file.name) return file
  const ext = (file.type.split('/')[1] || 'png').split(';')[0]
  return new File([file], `clipboard-${Date.now()}.${ext}`, { type: file.type })
}

/** Screenshots and phone clips are what people actually paste into a ticket. */
const isMedia = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/')

/**
 * CTRL+V AND DRAG-AND-DROP for file inputs.
 *
 * Reporting a fault almost always starts with a screenshot, and a screenshot
 * lives in the clipboard — not on disk. Forcing the reporter to save it as a
 * file first is the difference between a ticket with a picture and a ticket
 * without one, so v1 listened for `paste` while its drawer was open. v2 had no
 * paste handler anywhere; this is that behaviour, made reusable.
 *
 * ⚠️ The listener is on `document`, not on an input, because a screenshot is
 * pasted wherever the cursor happens to be — usually the description box, and
 * sometimes nowhere at all. It is only attached while `enabled` is true (the
 * dialog is open), otherwise every Ctrl+V anywhere in the app would try to
 * attach something.
 */
export function useFileDrop({
  enabled,
  onFiles,
  accept = isMedia,
}: {
  enabled: boolean
  onFiles: (files: File[]) => void
  /** Which files to keep. Defaults to images and video. */
  accept?: (f: File) => boolean
}) {
  const [dragging, setDragging] = useState(false)

  const take = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = Array.from(list ?? []).filter(accept).map(named)
      if (files.length) onFiles(files)
      return files.length
    },
    [accept, onFiles],
  )

  useEffect(() => {
    if (!enabled) return
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const files = items
        .filter((it) => it.kind === 'file')
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f && accept(f))
        .map(named)
      if (files.length) {
        // Only swallow the event when something was actually taken, so pasting
        // TEXT into the description still behaves normally.
        e.preventDefault()
        onFiles(files)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [enabled, accept, onFiles])

  /** Spread onto the drop zone. Keeps the browser from opening the file. */
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      take(e.dataTransfer?.files)
    },
  }

  return { dragging, dropProps, take }
}
