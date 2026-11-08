/**
 * Flux produits Google Merchant Center (RSS 2.0, espace de noms `g:`).
 *
 * Module pur : il reçoit des produits déjà lus et rend le XML. La lecture est
 * dans `app/flux/google-shopping.xml/route.ts`, les tests dans
 * tests/flux-google.test.ts.
 *
 * Règles suivies, et pourquoi :
 *
 * - **Une ligne par conditionnement vendu** (`g:id` = SKU), regroupées par
 *   fiche (`g:item_group_id`) quand une fiche en a plusieurs : le prix et la
 *   disponibilité doivent être ceux de la page, conditionnement compris.
 * - **Pas d'image, pas de ligne** : Google refuse un article sans image.
 * - **Pas de code-barres** : ce sont des packs composés par la boutique, sans
 *   GTIN. On le déclare (`g:identifier_exists` = no) plutôt que d'en inventer.
 * - **Livraison par pays**, calculée depuis les zones du back-office : le mode
 *   le moins cher, gratuit quand le prix atteint son seuil. Ce que le flux
 *   annonce est ce que le panier facturera.
 */

export type ArticleFlux = {
  slug: string
  name: string
  description: string | null
  brand: string | null
  productType: string | null
  images: string[]
  variants: Array<{
    sku: string
    name: string
    priceCents: number
    etat: 'IN_STOCK' | 'LOW_STOCK' | 'BACKORDER' | 'OUT_OF_STOCK'
  }>
}

export type TarifPays = {
  country: string
  modes: Array<{ label: string; priceCents: number; freeFromCents: number | null }>
}

const DISPONIBILITE: Record<ArticleFlux['variants'][number]['etat'], string> = {
  IN_STOCK: 'in_stock',
  LOW_STOCK: 'in_stock',
  BACKORDER: 'backorder',
  OUT_OF_STOCK: 'out_of_stock',
}

export function echapperXml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Caractères de contrôle interdits en XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/** Texte brut : sans balises ni syntaxe Markdown, espaces resserrés. */
export function texteBrut(texte: string): string {
  return texte
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_#>`]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const prix = (centimes: number) => `${(centimes / 100).toFixed(2)} EUR`

/** Le mode le moins cher du pays, au prix de cet article. `null` si aucun. */
export function fraisDePort(tarif: TarifPays, priceCents: number): number | null {
  const prixPossibles = tarif.modes.map((mode) =>
    mode.freeFromCents !== null && priceCents >= mode.freeFromCents ? 0 : mode.priceCents,
  )
  return prixPossibles.length > 0 ? Math.min(...prixPossibles) : null
}

/** Début du document, jusqu'aux articles. */
export function enteteFlux(siteUrl: string, titre: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
    `<title>${echapperXml(titre)}</title><link>${echapperXml(siteUrl)}</link>` +
    `<description>${echapperXml(`Catalogue ${titre}`)}</description>\n`
  )
}

/** Fin du document. */
export const PIED_FLUX = '\n</channel></rss>\n'

/**
 * Les lignes `<item>` d'un article : une par conditionnement. Vide quand
 * l'article n'a ni image ni conditionnement.
 */
export function lignesDeLArticle(
  article: ArticleFlux,
  options: { siteUrl: string; titre: string; tarifs: TarifPays[] },
): string[] {
  const { siteUrl, titre, tarifs } = options
  const absolue = (url: string) =>
    /^https?:\/\//.test(url) ? url : `${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`
  if (article.images.length === 0 || article.variants.length === 0) return []
  const plusieurs = article.variants.length > 1
  const description = texteBrut(article.description ?? '') || article.name
  const lignes: string[] = []

  for (const variante of article.variants) {
    const champs: string[] = [
      `<g:id>${echapperXml(variante.sku)}</g:id>`,
      `<g:title>${echapperXml(
        (plusieurs ? `${article.name} — ${variante.name}` : article.name).slice(0, 150),
      )}</g:title>`,
      `<g:description>${echapperXml(description.slice(0, 5000))}</g:description>`,
      `<g:link>${echapperXml(`${siteUrl}/p/${article.slug}`)}</g:link>`,
      `<g:image_link>${echapperXml(absolue(article.images[0]))}</g:image_link>`,
      ...article.images
        .slice(1, 11)
        .map((image) => `<g:additional_image_link>${echapperXml(absolue(image))}</g:additional_image_link>`),
      `<g:availability>${DISPONIBILITE[variante.etat]}</g:availability>`,
      `<g:price>${prix(variante.priceCents)}</g:price>`,
      `<g:condition>new</g:condition>`,
      `<g:brand>${echapperXml(article.brand ?? titre)}</g:brand>`,
      `<g:identifier_exists>no</g:identifier_exists>`,
      // « Véhicules et accessoires » : la catégorie où Google accepte les
      // visuels d'illustration (règles des images produit de Merchant Center).
      `<g:google_product_category>888</g:google_product_category>`,
    ]
    if (plusieurs) champs.push(`<g:item_group_id>${echapperXml(article.slug)}</g:item_group_id>`)
    if (article.productType) {
      champs.push(`<g:product_type>${echapperXml(article.productType)}</g:product_type>`)
    }
    for (const tarif of tarifs) {
      const frais = fraisDePort(tarif, variante.priceCents)
      if (frais === null) continue
      champs.push(
        `<g:shipping><g:country>${tarif.country}</g:country><g:price>${prix(frais)}</g:price></g:shipping>`,
      )
    }
    lignes.push(`<item>${champs.join('')}</item>`)
  }
  return lignes
}

export function construireFlux(options: {
  siteUrl: string
  titre: string
  articles: ArticleFlux[]
  tarifs: TarifPays[]
}): { xml: string; lignes: number } {
  const { siteUrl, titre, articles, tarifs } = options
  const lignes = articles.flatMap((article) => lignesDeLArticle(article, { siteUrl, titre, tarifs }))
  const xml = enteteFlux(siteUrl, titre) + lignes.join('\n') + PIED_FLUX
  return { xml, lignes: lignes.length }
}
