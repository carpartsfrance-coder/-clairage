/**
 * Adresse d'une page culot : « h7 », « w5w », « h27-2 », « p21-5w ».
 *
 * La barre oblique de « H27/2 » ou « P21/5W » coupait l'adresse en deux
 * (/culot/h27/2 : page introuvable) ; elle devient un tiret. La page culot
 * compare les deux côtés avec cette même fonction.
 */
export function adresseDuCulot(code: string): string {
  return code.trim().toLowerCase().replace(/\//g, '-')
}
