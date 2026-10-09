import type { ReportRow, StatusKey } from './api'

/**
 * PDF ga tushadigan diagrammani QAYTA chizish (canvas).
 *
 * ⚠️ NEGA EKRANDAGI SVG NI OLMAYMIZ: recharts o'lchamni CSS dan oladi, matn
 * rangi tungi mavzuda oq, o'zi esa CSS o'zgaruvchilariga tayanadi. Bunday SVG
 * ni serializatsiya qilib rasterlashtirganda brauzer uni to'liq bo'yamaydi —
 * qog'ozda bir rangli blok yoki umuman bo'sh maydon chiqardi (v1 da aynan shu
 * bosqichda yiqilgan). Shuning uchun bir xil ma'lumot canvasda YANGIDAN
 * chiziladi va natija har doim bir xil bo'ladi.
 *
 * ⚠️ NEGA BU YERDA RANG QATTIQ YOZILGAN: bu — QOG'OZ, interfeys emas. Mavzu
 * tokenlari ekran uchun tanlangan (tungi rejimda ochiq, oq fonda esa
 * o'qilmaydi), qog'oz esa doim oq va siyoh doim qora. Qatorlar RANGI baribir
 * tokenlardan olinadi — hisobotdagi «qabul qilingan / bajarilgan» ranglari
 * ekrandagi bilan bir xil bo'lishi kerak.
 */

/** Qog'oz yuzasi — mavzuga bog'liq EMAS (yuqoridagi izohga qarang). */
const PAPER = '#FFFFFF'
const GRID = '#E6EBF2'
const AXIS = '#C9D3E0'
const INK = '#1F2937'
const INK_MUTED = '#5A6472'

/** `--success` kabi tokenni canvas tushunadigan `rgb(r,g,b)` ga aylantiradi.
 *  Token qiymati «24 161 94» ko'rinishida saqlanadi (Tailwind alfa uchun). */
function tokenColor(name: string, fallback: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (!raw) return fallback
    return `rgb(${raw.split(/\s+/).join(',')})`
  } catch {
    return fallback
  }
}

export interface ChartPngInput {
  rows: ReportRow[]
  /** Chizilishi kerak bo'lgan qatorlar — ekranda yashirilgani tushmaydi. */
  keys: StatusKey[]
  /** Qator nomi (tarjima qilingan) — legenda uchun. */
  label: (key: StatusKey) => string
  /** Qator rangi — CSS token nomi (`--success` …). */
  token: (key: StatusKey) => string
  stacked: boolean
}

/** Diagrammaning PNG data-URL i; chizishga narsa bo'lmasa `null`. */
export function renderChartPng({ rows, keys, label, token, stacked }: ChartPngInput): string | null {
  if (!rows.length || !keys.length) return null

  const scale = 2
  const W = 1100
  const H = 380
  const PAD = { top: 40, right: 20, bottom: 62, left: 62 }

  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(scale, scale)

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const color = (k: StatusKey) => tokenColor(token(k), INK_MUTED)

  const maxVal = stacked
    ? Math.max(1, ...rows.map((r) => keys.reduce((a, k) => a + (r[k] || 0), 0)))
    : Math.max(1, ...rows.flatMap((r) => keys.map((k) => r[k] || 0)))
  // O'q belgilari butun son bo'lsin — «chiroyli» yuqori chegara.
  const step = Math.max(1, Math.ceil(maxVal / 5))
  const top = step * 5

  ctx.font = '11px Arial, sans-serif'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= 5; i += 1) {
    const value = step * i
    const y = PAD.top + plotH - (value / top) * plotH
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, y + 0.5)
    ctx.lineTo(PAD.left + plotW, y + 0.5)
    ctx.stroke()
    ctx.fillStyle = INK_MUTED
    ctx.textAlign = 'right'
    ctx.fillText(String(value), PAD.left - 10, y)
  }

  const groupW = plotW / rows.length
  const innerPad = groupW * 0.22
  const barsW = groupW - innerPad * 2

  rows.forEach((row, gi) => {
    const gx = PAD.left + gi * groupW + innerPad
    if (stacked) {
      let acc = 0
      keys.forEach((k) => {
        const value = row[k] || 0
        if (!value) return
        const h = (value / top) * plotH
        const y = PAD.top + plotH - (acc / top) * plotH - h
        ctx.fillStyle = color(k)
        // 2px oraliq — ustma-ust bo'laklar bir-biriga yopishib ketmasin.
        ctx.fillRect(gx, y, barsW, Math.max(1, h - 2))
        acc += value
      })
    } else {
      const bw = Math.max(6, Math.min(30, barsW / keys.length - 4))
      const total = bw * keys.length + 4 * (keys.length - 1)
      const startX = gx + (barsW - total) / 2
      keys.forEach((k, bi) => {
        const value = row[k] || 0
        const h = (value / top) * plotH
        const x = startX + bi * (bw + 4)
        ctx.fillStyle = color(k)
        ctx.fillRect(x, PAD.top + plotH - h, bw, h)
        if (value) {
          ctx.fillStyle = INK
          ctx.textAlign = 'center'
          ctx.font = 'bold 10px Arial, sans-serif'
          ctx.fillText(String(value), x + bw / 2, PAD.top + plotH - h - 8)
          ctx.font = '11px Arial, sans-serif'
        }
      })
    }
    ctx.fillStyle = INK_MUTED
    ctx.textAlign = 'center'
    ctx.fillText(String(row.label).slice(0, 22), gx + barsW / 2, PAD.top + plotH + 16)
  })

  ctx.strokeStyle = AXIS
  ctx.beginPath()
  ctx.moveTo(PAD.left, PAD.top + plotH + 0.5)
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH + 0.5)
  ctx.stroke()

  // Legenda — qatorlar rangi bilan emas, RANG + NOM juftligi bilan tanilsin.
  let lx = PAD.left
  const ly = H - 20
  ctx.textAlign = 'left'
  ctx.font = '11px Arial, sans-serif'
  keys.forEach((k) => {
    const text = label(k)
    ctx.fillStyle = color(k)
    ctx.fillRect(lx, ly - 5, 11, 11)
    ctx.fillStyle = INK
    ctx.fillText(text, lx + 16, ly)
    lx += 16 + ctx.measureText(text).width + 22
  })

  return canvas.toDataURL('image/png')
}
