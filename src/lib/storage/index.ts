import 'server-only'

/**
 * Point d'entrée serveur du stockage.
 *
 * Toute la logique est dans `./driver`, volontairement neutre : ni
 * `'use client'`, ni `server-only`. La raison est la même que pour
 * `./file-type` — les scripts d'import tournent sous `tsx`, en dehors de tout
 * rendu React, et un module marqué `server-only` lève à l'import chez eux.
 *
 * Ce fichier garde donc la marque `server-only` pour le code de
 * l'application, qui continue d'importer `@/lib/storage` : un composant client
 * qui tirerait dessus échouerait à la compilation, comme avant. Un script, lui,
 * importe `./driver` directement et assume d'être côté serveur par nature.
 */
export * from './driver'
