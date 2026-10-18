import { identity, siteConfig } from '../identity'

/**
 * Gabarit commun des e-mails.
 *
 * Les clients de messagerie sont restés en 2005 : pas de flexbox, pas de
 * grille, pas de feuille de style externe, et Outlook ignore une partie du CSS
 * en ligne. D'où le tableau et les styles écrits sur chaque balise — ce n'est
 * pas de la négligence, c'est ce qui s'affiche partout.
 *
 * Chaque message part aussi en texte brut. Ce n'est pas une formalité : les
 * filtres anti-spam pénalisent les messages HTML sans équivalent texte, et
 * certains clients n'affichent que celui-là.
 */

const BRAND = '#EC2525'
const INK = '#212428'
const MUTED = '#6B7280'
const LINE = '#E3E5E9'

export type EmailBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'button'; label: string; href: string }
  | { type: 'facts'; rows: Array<[string, string]> }
  | { type: 'note'; text: string }
  | { type: 'list'; items: string[] }

/** Échappe le HTML : un nom de client peut contenir n'importe quoi. */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderHtml(options: {
  preheader: string
  title: string
  blocks: EmailBlock[]
  /** Mention affichée en pied, sous les mentions légales. */
  footerNote?: string
}): string {
  const body = options.blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<tr><td style="padding:0 0 8px;font:700 18px/1.3 Helvetica,Arial,sans-serif;color:${INK}">${escape(block.text)}</td></tr>`
        case 'paragraph':
          return `<tr><td style="padding:0 0 14px;font:400 15px/1.55 Helvetica,Arial,sans-serif;color:${INK}">${escape(block.text)}</td></tr>`
        case 'note':
          return `<tr><td style="padding:0 0 14px;font:400 13px/1.5 Helvetica,Arial,sans-serif;color:${MUTED}">${escape(block.text)}</td></tr>`
        case 'list':
          return `<tr><td style="padding:0 0 14px;font:400 15px/1.55 Helvetica,Arial,sans-serif;color:${INK}"><ul style="margin:0;padding-left:20px">${block.items
            .map((item) => `<li style="padding:2px 0">${escape(item)}</li>`)
            .join('')}</ul></td></tr>`
        case 'facts':
          return `<tr><td style="padding:0 0 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:6px">${block.rows
            .map(
              ([label, value], index) =>
                `<tr><td style="padding:10px 14px;font:400 14px/1.4 Helvetica,Arial,sans-serif;color:${MUTED};${index > 0 ? `border-top:1px solid ${LINE}` : ''}">${escape(label)}</td><td align="right" style="padding:10px 14px;font:700 14px/1.4 Helvetica,Arial,sans-serif;color:${INK};${index > 0 ? `border-top:1px solid ${LINE}` : ''}">${escape(value)}</td></tr>`,
            )
            .join('')}</table></td></tr>`
        case 'button':
          // Un lien stylé en bouton : les <button> ne fonctionnent pas en e-mail.
          return `<tr><td style="padding:4px 0 18px"><a href="${escape(block.href)}" style="display:inline-block;padding:13px 22px;background:${BRAND};color:#ffffff;font:700 15px/1 Helvetica,Arial,sans-serif;text-decoration:none;border-radius:4px">${escape(block.label)}</a></td></tr>`
      }
    })
    .join('')

  const legal = identity.legal.companyName
    ? `${escape(identity.legal.companyName)}${identity.legal.siret ? ` · SIRET ${escape(identity.legal.siret)}` : ''}`
    : "Identité légale à renseigner avant l'ouverture commerciale."

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escape(options.title)}</title></head>
<body style="margin:0;padding:0;background:#F9F9FA">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9F9FA;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:8px">
  <tr><td style="padding:20px 24px;border-bottom:1px solid ${LINE}">
    <span style="font:800 22px/1 Helvetica,Arial,sans-serif;color:${INK};letter-spacing:-0.5px">${escape(identity.name)}<span style="color:${BRAND}">${escape(identity.wordmarkSuffix)}</span></span>
    <div style="font:600 10px/1.4 Helvetica,Arial,sans-serif;color:${MUTED};letter-spacing:2px;text-transform:uppercase;padding-top:4px">${escape(identity.baseline)}</div>
  </td></tr>
  <tr><td style="padding:22px 24px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
  </td></tr>
  <tr><td style="padding:16px 24px 20px;border-top:1px solid ${LINE};font:400 12px/1.5 Helvetica,Arial,sans-serif;color:${MUTED}">
    ${options.footerNote ? `<div style="padding-bottom:8px">${escape(options.footerNote)}</div>` : ''}
    <div>${legal}</div>
    <div style="padding-top:6px"><a href="${escape(siteConfig.url)}" style="color:${MUTED}">${escape(siteConfig.url.replace(/^https?:\/\//, ''))}</a></div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

/** Équivalent texte, construit depuis les mêmes blocs pour éviter la dérive. */
export function renderText(options: { title: string; blocks: EmailBlock[]; footerNote?: string }): string {
  const lines: string[] = [options.title, '='.repeat(Math.min(options.title.length, 60)), '']

  for (const block of options.blocks) {
    switch (block.type) {
      case 'heading':
        lines.push(block.text.toUpperCase(), '')
        break
      case 'paragraph':
      case 'note':
        lines.push(block.text, '')
        break
      case 'list':
        lines.push(...block.items.map((item) => `- ${item}`), '')
        break
      case 'facts':
        lines.push(...block.rows.map(([label, value]) => `${label} : ${value}`), '')
        break
      case 'button':
        lines.push(`${block.label} : ${block.href}`, '')
        break
    }
  }

  if (options.footerNote) lines.push(options.footerNote, '')
  lines.push(
    identity.legal.companyName ?? "Identité légale à renseigner avant l'ouverture commerciale.",
    siteConfig.url,
  )

  return lines.join('\n')
}
