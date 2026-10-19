import { PrismaClient, type VehicleType } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Référentiel véhicule : marques, modèles, générations.
 *
 * **Ce script n'écrit aucune compatibilité.** C'est la distinction qui tient
 * tout le fichier, et elle mérite d'être comprise avant d'y toucher.
 *
 * Une marque, un modèle, une génération sont des faits publics : la Golf VII
 * existe, elle a été produite de 2012 à 2020, et l'écrire n'engage personne.
 * Dire qu'une ampoule donnée l'éclaire correctement est un tout autre acte :
 * c'est une affirmation commerciale, vérifiable, et dont dépend l'achat du
 * client. Les deux ne se seedent pas ensemble.
 *
 * Conséquence directe et voulue : après ce script, une page de génération
 * annonce « aucun éclairage documenté ». C'est exact. Tant que personne n'a
 * relevé les compatibilités de ce véhicule, il n'y a rien à en dire — et une
 * arborescence qui se remplirait toute seule de correspondances plausibles
 * serait pire que vide, parce qu'elle aurait l'air renseignée.
 *
 * **Ce que valent les millésimes.** Ils viennent de connaissances générales,
 * pas d'un référentiel constructeur ni d'une base TecDoc. Ils situent une
 * génération ; ils ne font pas foi. Tant qu'aucune compatibilité n'y est
 * rattachée, une borne approximative n'induit personne en erreur — au pire le
 * client ne trouve pas son millésime. **À reprendre sur une source
 * constructeur avant d'attacher la moindre compatibilité à ces générations.**
 *
 * Le script est **idempotent** : il crée ce qui manque, met à jour les
 * libellés et les millésimes, et ne supprime ni ne désactive rien. Une entrée
 * retirée de ce fichier reste en base — c'est au back-office de la désactiver.
 *
 * Lancement : `npm run seed:vehicles`
 */

type Generation = {
  slug: string
  name: string
  yearFrom: number
  /** Nul si la génération est toujours produite. */
  yearTo?: number
  phase?: string
}

type Model = { slug: string; name: string; generations: Generation[] }
type Make = { slug: string; name: string; type: VehicleType; models: Model[] }

/*
  `VehicleMake.slug` est unique sur toute la table, types confondus. Honda,
  Suzuki et BMW vendent des voitures ET des deux-roues : leurs entrées moto
  portent donc un slug distinct. Le nom affiché, lui, reste le nom de la
  marque — c'est le type qui les sépare dans l'interface, pas le libellé.
*/

const VOITURES: Make[] = [
  {
    slug: 'alfa-romeo', name: 'Alfa Romeo', type: 'CAR',
    models: [
      { slug: 'giulietta', name: 'Giulietta', generations: [{ slug: 'giulietta-940', name: 'Giulietta', yearFrom: 2010, yearTo: 2020 }] },
      { slug: 'giulia', name: 'Giulia', generations: [{ slug: 'giulia-952', name: 'Giulia', yearFrom: 2016 }] },
      { slug: 'stelvio', name: 'Stelvio', generations: [{ slug: 'stelvio-949', name: 'Stelvio', yearFrom: 2016 }] },
    ],
  },
  {
    slug: 'audi', name: 'Audi', type: 'CAR',
    models: [
      { slug: 'a1', name: 'A1', generations: [
        { slug: 'a1-8x', name: 'A1 (8X)', yearFrom: 2010, yearTo: 2018 },
        { slug: 'a1-gb', name: 'A1 (GB)', yearFrom: 2018 },
      ] },
      { slug: 'a3', name: 'A3', generations: [
        { slug: 'a3-8p', name: 'A3 (8P)', yearFrom: 2003, yearTo: 2012 },
        { slug: 'a3-8v', name: 'A3 (8V)', yearFrom: 2012, yearTo: 2020 },
        { slug: 'a3-8y', name: 'A3 (8Y)', yearFrom: 2020 },
      ] },
      { slug: 'a4', name: 'A4', generations: [
        { slug: 'a4-b8', name: 'A4 (B8)', yearFrom: 2007, yearTo: 2015 },
        { slug: 'a4-b9', name: 'A4 (B9)', yearFrom: 2015 },
      ] },
      { slug: 'a6', name: 'A6', generations: [
        { slug: 'a6-c7', name: 'A6 (C7)', yearFrom: 2011, yearTo: 2018 },
        { slug: 'a6-c8', name: 'A6 (C8)', yearFrom: 2018 },
      ] },
      { slug: 'q3', name: 'Q3', generations: [
        { slug: 'q3-8u', name: 'Q3 (8U)', yearFrom: 2011, yearTo: 2018 },
        { slug: 'q3-f3', name: 'Q3 (F3)', yearFrom: 2018 },
      ] },
      { slug: 'q5', name: 'Q5', generations: [
        { slug: 'q5-8r', name: 'Q5 (8R)', yearFrom: 2008, yearTo: 2017 },
        { slug: 'q5-fy', name: 'Q5 (FY)', yearFrom: 2017 },
      ] },
    ],
  },
  {
    slug: 'bmw', name: 'BMW', type: 'CAR',
    models: [
      { slug: 'serie-1', name: 'Série 1', generations: [
        { slug: 'serie-1-e87', name: 'Série 1 (E81/E87)', yearFrom: 2004, yearTo: 2011 },
        { slug: 'serie-1-f20', name: 'Série 1 (F20/F21)', yearFrom: 2011, yearTo: 2019 },
        { slug: 'serie-1-f40', name: 'Série 1 (F40)', yearFrom: 2019 },
      ] },
      { slug: 'serie-3', name: 'Série 3', generations: [
        { slug: 'serie-3-e90', name: 'Série 3 (E90)', yearFrom: 2005, yearTo: 2012 },
        { slug: 'serie-3-f30', name: 'Série 3 (F30)', yearFrom: 2012, yearTo: 2019 },
        { slug: 'serie-3-g20', name: 'Série 3 (G20)', yearFrom: 2019 },
      ] },
      { slug: 'serie-5', name: 'Série 5', generations: [
        { slug: 'serie-5-f10', name: 'Série 5 (F10)', yearFrom: 2010, yearTo: 2017 },
        { slug: 'serie-5-g30', name: 'Série 5 (G30)', yearFrom: 2017 },
      ] },
      { slug: 'x1', name: 'X1', generations: [
        { slug: 'x1-e84', name: 'X1 (E84)', yearFrom: 2009, yearTo: 2015 },
        { slug: 'x1-f48', name: 'X1 (F48)', yearFrom: 2015, yearTo: 2022 },
      ] },
      { slug: 'x3', name: 'X3', generations: [
        { slug: 'x3-f25', name: 'X3 (F25)', yearFrom: 2010, yearTo: 2017 },
        { slug: 'x3-g01', name: 'X3 (G01)', yearFrom: 2017 },
      ] },
    ],
  },
  {
    slug: 'citroen', name: 'Citroën', type: 'CAR',
    models: [
      { slug: 'c1', name: 'C1', generations: [{ slug: 'c1-ii', name: 'C1 II', yearFrom: 2014, yearTo: 2022 }] },
      { slug: 'c3', name: 'C3', generations: [
        { slug: 'c3-ii', name: 'C3 II', yearFrom: 2009, yearTo: 2016 },
        { slug: 'c3-iii', name: 'C3 III', yearFrom: 2016 },
      ] },
      { slug: 'c3-aircross', name: 'C3 Aircross', generations: [{ slug: 'c3-aircross-i', name: 'C3 Aircross I', yearFrom: 2017 }] },
      { slug: 'c4', name: 'C4', generations: [
        { slug: 'c4-ii', name: 'C4 II', yearFrom: 2010, yearTo: 2018 },
        { slug: 'c4-iii', name: 'C4 III', yearFrom: 2020 },
      ] },
      { slug: 'c5-aircross', name: 'C5 Aircross', generations: [{ slug: 'c5-aircross-i', name: 'C5 Aircross I', yearFrom: 2018 }] },
      { slug: 'berlingo', name: 'Berlingo', generations: [
        { slug: 'berlingo-ii', name: 'Berlingo II', yearFrom: 2008, yearTo: 2018 },
        { slug: 'berlingo-iii', name: 'Berlingo III', yearFrom: 2018 },
      ] },
    ],
  },
  {
    slug: 'dacia', name: 'Dacia', type: 'CAR',
    models: [
      { slug: 'sandero', name: 'Sandero', generations: [
        { slug: 'sandero-ii', name: 'Sandero II', yearFrom: 2012, yearTo: 2020 },
        { slug: 'sandero-iii', name: 'Sandero III', yearFrom: 2020 },
      ] },
      { slug: 'duster', name: 'Duster', generations: [
        { slug: 'duster-i', name: 'Duster I', yearFrom: 2010, yearTo: 2017 },
        { slug: 'duster-ii', name: 'Duster II', yearFrom: 2017, yearTo: 2024 },
      ] },
      { slug: 'logan', name: 'Logan', generations: [{ slug: 'logan-ii', name: 'Logan II', yearFrom: 2012, yearTo: 2020 }] },
      { slug: 'spring', name: 'Spring', generations: [{ slug: 'spring-i', name: 'Spring', yearFrom: 2021 }] },
    ],
  },
  {
    slug: 'fiat', name: 'Fiat', type: 'CAR',
    models: [
      { slug: '500', name: '500', generations: [{ slug: '500-312', name: '500', yearFrom: 2007 }] },
      { slug: 'panda', name: 'Panda', generations: [{ slug: 'panda-iii', name: 'Panda III', yearFrom: 2011 }] },
      { slug: 'tipo', name: 'Tipo', generations: [{ slug: 'tipo-356', name: 'Tipo', yearFrom: 2015 }] },
      { slug: 'ducato', name: 'Ducato', generations: [{ slug: 'ducato-iii', name: 'Ducato III', yearFrom: 2006 }] },
    ],
  },
  {
    slug: 'ford', name: 'Ford', type: 'CAR',
    models: [
      { slug: 'fiesta', name: 'Fiesta', generations: [
        { slug: 'fiesta-vi', name: 'Fiesta VI', yearFrom: 2008, yearTo: 2017 },
        { slug: 'fiesta-vii', name: 'Fiesta VII', yearFrom: 2017, yearTo: 2023 },
      ] },
      { slug: 'focus', name: 'Focus', generations: [
        { slug: 'focus-iii', name: 'Focus III', yearFrom: 2011, yearTo: 2018 },
        { slug: 'focus-iv', name: 'Focus IV', yearFrom: 2018 },
      ] },
      { slug: 'kuga', name: 'Kuga', generations: [
        { slug: 'kuga-ii', name: 'Kuga II', yearFrom: 2012, yearTo: 2019 },
        { slug: 'kuga-iii', name: 'Kuga III', yearFrom: 2019 },
      ] },
      { slug: 'puma', name: 'Puma', generations: [{ slug: 'puma-ii', name: 'Puma', yearFrom: 2019 }] },
      { slug: 'transit-custom', name: 'Transit Custom', generations: [{ slug: 'transit-custom-i', name: 'Transit Custom', yearFrom: 2012 }] },
    ],
  },
  {
    slug: 'honda', name: 'Honda', type: 'CAR',
    models: [
      { slug: 'civic', name: 'Civic', generations: [
        { slug: 'civic-ix', name: 'Civic IX', yearFrom: 2011, yearTo: 2017 },
        { slug: 'civic-x', name: 'Civic X', yearFrom: 2017, yearTo: 2021 },
      ] },
      { slug: 'cr-v', name: 'CR-V', generations: [
        { slug: 'cr-v-iv', name: 'CR-V IV', yearFrom: 2012, yearTo: 2018 },
        { slug: 'cr-v-v', name: 'CR-V V', yearFrom: 2018 },
      ] },
      { slug: 'jazz', name: 'Jazz', generations: [
        { slug: 'jazz-iii', name: 'Jazz III', yearFrom: 2013, yearTo: 2020 },
        { slug: 'jazz-iv', name: 'Jazz IV', yearFrom: 2020 },
      ] },
    ],
  },
  {
    slug: 'hyundai', name: 'Hyundai', type: 'CAR',
    models: [
      { slug: 'i10', name: 'i10', generations: [{ slug: 'i10-iii', name: 'i10 III', yearFrom: 2019 }] },
      { slug: 'i20', name: 'i20', generations: [
        { slug: 'i20-ii', name: 'i20 II', yearFrom: 2014, yearTo: 2020 },
        { slug: 'i20-iii', name: 'i20 III', yearFrom: 2020 },
      ] },
      { slug: 'i30', name: 'i30', generations: [
        { slug: 'i30-ii', name: 'i30 II', yearFrom: 2011, yearTo: 2016 },
        { slug: 'i30-iii', name: 'i30 III', yearFrom: 2016 },
      ] },
      { slug: 'tucson', name: 'Tucson', generations: [
        { slug: 'tucson-iii', name: 'Tucson III', yearFrom: 2015, yearTo: 2020 },
        { slug: 'tucson-iv', name: 'Tucson IV', yearFrom: 2020 },
      ] },
      { slug: 'kona', name: 'Kona', generations: [{ slug: 'kona-i', name: 'Kona I', yearFrom: 2017, yearTo: 2023 }] },
    ],
  },
  {
    slug: 'jeep', name: 'Jeep', type: 'CAR',
    models: [
      { slug: 'renegade', name: 'Renegade', generations: [{ slug: 'renegade-bu', name: 'Renegade', yearFrom: 2014 }] },
      { slug: 'compass', name: 'Compass', generations: [{ slug: 'compass-ii', name: 'Compass II', yearFrom: 2017 }] },
    ],
  },
  {
    slug: 'kia', name: 'Kia', type: 'CAR',
    models: [
      { slug: 'picanto', name: 'Picanto', generations: [{ slug: 'picanto-iii', name: 'Picanto III', yearFrom: 2017 }] },
      { slug: 'rio', name: 'Rio', generations: [{ slug: 'rio-iv', name: 'Rio IV', yearFrom: 2017 }] },
      { slug: 'ceed', name: 'Ceed', generations: [
        { slug: 'ceed-ii', name: "cee'd II", yearFrom: 2012, yearTo: 2018 },
        { slug: 'ceed-iii', name: 'Ceed III', yearFrom: 2018 },
      ] },
      { slug: 'sportage', name: 'Sportage', generations: [
        { slug: 'sportage-iv', name: 'Sportage IV', yearFrom: 2016, yearTo: 2021 },
        { slug: 'sportage-v', name: 'Sportage V', yearFrom: 2021 },
      ] },
      { slug: 'niro', name: 'Niro', generations: [{ slug: 'niro-i', name: 'Niro I', yearFrom: 2016, yearTo: 2022 }] },
    ],
  },
  {
    slug: 'land-rover', name: 'Land Rover', type: 'CAR',
    models: [
      { slug: 'discovery-sport', name: 'Discovery Sport', generations: [{ slug: 'discovery-sport-l550', name: 'Discovery Sport', yearFrom: 2014 }] },
      { slug: 'range-rover-evoque', name: 'Range Rover Evoque', generations: [
        { slug: 'evoque-l538', name: 'Evoque I (L538)', yearFrom: 2011, yearTo: 2018 },
        { slug: 'evoque-l551', name: 'Evoque II (L551)', yearFrom: 2018 },
      ] },
    ],
  },
  {
    slug: 'mazda', name: 'Mazda', type: 'CAR',
    models: [
      { slug: 'mazda2', name: 'Mazda2', generations: [{ slug: 'mazda2-iii', name: 'Mazda2 III', yearFrom: 2014 }] },
      { slug: 'mazda3', name: 'Mazda3', generations: [
        { slug: 'mazda3-iii', name: 'Mazda3 III', yearFrom: 2013, yearTo: 2019 },
        { slug: 'mazda3-iv', name: 'Mazda3 IV', yearFrom: 2019 },
      ] },
      { slug: 'cx-5', name: 'CX-5', generations: [
        { slug: 'cx-5-i', name: 'CX-5 I', yearFrom: 2012, yearTo: 2017 },
        { slug: 'cx-5-ii', name: 'CX-5 II', yearFrom: 2017 },
      ] },
      { slug: 'mx-5', name: 'MX-5', generations: [{ slug: 'mx-5-nd', name: 'MX-5 (ND)', yearFrom: 2015 }] },
    ],
  },
  {
    slug: 'mercedes-benz', name: 'Mercedes-Benz', type: 'CAR',
    models: [
      { slug: 'classe-a', name: 'Classe A', generations: [
        { slug: 'classe-a-w176', name: 'Classe A (W176)', yearFrom: 2012, yearTo: 2018 },
        { slug: 'classe-a-w177', name: 'Classe A (W177)', yearFrom: 2018 },
      ] },
      { slug: 'classe-c', name: 'Classe C', generations: [
        { slug: 'classe-c-w204', name: 'Classe C (W204)', yearFrom: 2007, yearTo: 2014 },
        { slug: 'classe-c-w205', name: 'Classe C (W205)', yearFrom: 2014, yearTo: 2021 },
        { slug: 'classe-c-w206', name: 'Classe C (W206)', yearFrom: 2021 },
      ] },
      { slug: 'classe-e', name: 'Classe E', generations: [
        { slug: 'classe-e-w212', name: 'Classe E (W212)', yearFrom: 2009, yearTo: 2016 },
        { slug: 'classe-e-w213', name: 'Classe E (W213)', yearFrom: 2016 },
      ] },
      { slug: 'gla', name: 'GLA', generations: [
        { slug: 'gla-x156', name: 'GLA (X156)', yearFrom: 2013, yearTo: 2020 },
        { slug: 'gla-h247', name: 'GLA (H247)', yearFrom: 2020 },
      ] },
      { slug: 'sprinter', name: 'Sprinter', generations: [{ slug: 'sprinter-w907', name: 'Sprinter (W907/W910)', yearFrom: 2018 }] },
    ],
  },
  {
    slug: 'mini', name: 'Mini', type: 'CAR',
    models: [
      { slug: 'mini', name: 'Mini', generations: [
        { slug: 'mini-r56', name: 'Mini (R56)', yearFrom: 2006, yearTo: 2013 },
        { slug: 'mini-f56', name: 'Mini (F56)', yearFrom: 2014 },
      ] },
      { slug: 'countryman', name: 'Countryman', generations: [{ slug: 'countryman-f60', name: 'Countryman (F60)', yearFrom: 2017 }] },
    ],
  },
  {
    slug: 'mitsubishi', name: 'Mitsubishi', type: 'CAR',
    models: [
      { slug: 'asx', name: 'ASX', generations: [{ slug: 'asx-i', name: 'ASX I', yearFrom: 2010, yearTo: 2023 }] },
      { slug: 'outlander', name: 'Outlander', generations: [{ slug: 'outlander-iii', name: 'Outlander III', yearFrom: 2012, yearTo: 2021 }] },
      { slug: 'space-star', name: 'Space Star', generations: [{ slug: 'space-star-ii', name: 'Space Star', yearFrom: 2012 }] },
    ],
  },
  {
    slug: 'nissan', name: 'Nissan', type: 'CAR',
    models: [
      { slug: 'micra', name: 'Micra', generations: [
        { slug: 'micra-k13', name: 'Micra (K13)', yearFrom: 2010, yearTo: 2016 },
        { slug: 'micra-k14', name: 'Micra (K14)', yearFrom: 2017 },
      ] },
      { slug: 'juke', name: 'Juke', generations: [
        { slug: 'juke-f15', name: 'Juke I (F15)', yearFrom: 2010, yearTo: 2019 },
        { slug: 'juke-f16', name: 'Juke II (F16)', yearFrom: 2019 },
      ] },
      { slug: 'qashqai', name: 'Qashqai', generations: [
        { slug: 'qashqai-j11', name: 'Qashqai II (J11)', yearFrom: 2013, yearTo: 2021 },
        { slug: 'qashqai-j12', name: 'Qashqai III (J12)', yearFrom: 2021 },
      ] },
      { slug: 'x-trail', name: 'X-Trail', generations: [{ slug: 'x-trail-t32', name: 'X-Trail (T32)', yearFrom: 2014, yearTo: 2022 }] },
    ],
  },
  {
    slug: 'opel', name: 'Opel', type: 'CAR',
    models: [
      { slug: 'corsa', name: 'Corsa', generations: [
        { slug: 'corsa-d', name: 'Corsa D', yearFrom: 2006, yearTo: 2014 },
        { slug: 'corsa-e', name: 'Corsa E', yearFrom: 2014, yearTo: 2019 },
        { slug: 'corsa-f', name: 'Corsa F', yearFrom: 2019 },
      ] },
      { slug: 'astra', name: 'Astra', generations: [
        { slug: 'astra-j', name: 'Astra J', yearFrom: 2009, yearTo: 2015 },
        { slug: 'astra-k', name: 'Astra K', yearFrom: 2015, yearTo: 2021 },
        { slug: 'astra-l', name: 'Astra L', yearFrom: 2021 },
      ] },
      { slug: 'mokka', name: 'Mokka', generations: [
        { slug: 'mokka-i', name: 'Mokka I', yearFrom: 2012, yearTo: 2019 },
        { slug: 'mokka-ii', name: 'Mokka II', yearFrom: 2020 },
      ] },
      { slug: 'crossland', name: 'Crossland', generations: [{ slug: 'crossland-i', name: 'Crossland', yearFrom: 2017 }] },
    ],
  },
  {
    slug: 'peugeot', name: 'Peugeot', type: 'CAR',
    models: [
      { slug: '108', name: '108', generations: [{ slug: '108-i', name: '108', yearFrom: 2014, yearTo: 2021 }] },
      { slug: '208', name: '208', generations: [
        { slug: '208-i', name: '208 I', yearFrom: 2012, yearTo: 2019 },
        { slug: '208-ii', name: '208 II', yearFrom: 2019 },
      ] },
      { slug: '2008', name: '2008', generations: [
        { slug: '2008-i', name: '2008 I', yearFrom: 2013, yearTo: 2019 },
        { slug: '2008-ii', name: '2008 II', yearFrom: 2019 },
      ] },
      { slug: '308', name: '308', generations: [
        { slug: '308-i', name: '308 I', yearFrom: 2007, yearTo: 2013 },
        { slug: '308-ii', name: '308 II', yearFrom: 2013, yearTo: 2021 },
        { slug: '308-iii', name: '308 III', yearFrom: 2021 },
      ] },
      { slug: '3008', name: '3008', generations: [
        { slug: '3008-i', name: '3008 I', yearFrom: 2009, yearTo: 2016 },
        { slug: '3008-ii', name: '3008 II', yearFrom: 2016, yearTo: 2023 },
      ] },
      { slug: '5008', name: '5008', generations: [{ slug: '5008-ii', name: '5008 II', yearFrom: 2017 }] },
      { slug: '508', name: '508', generations: [
        { slug: '508-i', name: '508 I', yearFrom: 2010, yearTo: 2018 },
        { slug: '508-ii', name: '508 II', yearFrom: 2018 },
      ] },
      { slug: 'partner', name: 'Partner', generations: [{ slug: 'partner-iii', name: 'Partner III', yearFrom: 2018 }] },
    ],
  },
  {
    slug: 'renault', name: 'Renault', type: 'CAR',
    models: [
      { slug: 'twingo', name: 'Twingo', generations: [{ slug: 'twingo-iii', name: 'Twingo III', yearFrom: 2014, yearTo: 2024 }] },
      { slug: 'clio', name: 'Clio', generations: [
        { slug: 'clio-iii', name: 'Clio III', yearFrom: 2005, yearTo: 2012 },
        { slug: 'clio-iv', name: 'Clio IV', yearFrom: 2012, yearTo: 2019 },
        { slug: 'clio-v', name: 'Clio V', yearFrom: 2019 },
      ] },
      { slug: 'captur', name: 'Captur', generations: [
        { slug: 'captur-i', name: 'Captur I', yearFrom: 2013, yearTo: 2019 },
        { slug: 'captur-ii', name: 'Captur II', yearFrom: 2019 },
      ] },
      { slug: 'megane', name: 'Mégane', generations: [
        { slug: 'megane-iii', name: 'Mégane III', yearFrom: 2008, yearTo: 2016 },
        { slug: 'megane-iv', name: 'Mégane IV', yearFrom: 2016 },
      ] },
      { slug: 'scenic', name: 'Scénic', generations: [
        { slug: 'scenic-iii', name: 'Scénic III', yearFrom: 2009, yearTo: 2016 },
        { slug: 'scenic-iv', name: 'Scénic IV', yearFrom: 2016, yearTo: 2022 },
      ] },
      { slug: 'kadjar', name: 'Kadjar', generations: [{ slug: 'kadjar-i', name: 'Kadjar', yearFrom: 2015, yearTo: 2022 }] },
      { slug: 'zoe', name: 'Zoe', generations: [{ slug: 'zoe-i', name: 'Zoe', yearFrom: 2012, yearTo: 2024 }] },
      { slug: 'kangoo', name: 'Kangoo', generations: [
        { slug: 'kangoo-ii', name: 'Kangoo II', yearFrom: 2008, yearTo: 2021 },
        { slug: 'kangoo-iii', name: 'Kangoo III', yearFrom: 2021 },
      ] },
      { slug: 'trafic', name: 'Trafic', generations: [{ slug: 'trafic-iii', name: 'Trafic III', yearFrom: 2014 }] },
    ],
  },
  {
    slug: 'seat', name: 'Seat', type: 'CAR',
    models: [
      { slug: 'ibiza', name: 'Ibiza', generations: [
        { slug: 'ibiza-iv', name: 'Ibiza IV (6J)', yearFrom: 2008, yearTo: 2017 },
        { slug: 'ibiza-v', name: 'Ibiza V (KJ)', yearFrom: 2017 },
      ] },
      { slug: 'leon', name: 'Leon', generations: [
        { slug: 'leon-iii', name: 'Leon III (5F)', yearFrom: 2012, yearTo: 2020 },
        { slug: 'leon-iv', name: 'Leon IV (KL)', yearFrom: 2020 },
      ] },
      { slug: 'arona', name: 'Arona', generations: [{ slug: 'arona-i', name: 'Arona', yearFrom: 2017 }] },
      { slug: 'ateca', name: 'Ateca', generations: [{ slug: 'ateca-i', name: 'Ateca', yearFrom: 2016 }] },
    ],
  },
  {
    slug: 'skoda', name: 'Škoda', type: 'CAR',
    models: [
      { slug: 'fabia', name: 'Fabia', generations: [
        { slug: 'fabia-iii', name: 'Fabia III', yearFrom: 2014, yearTo: 2021 },
        { slug: 'fabia-iv', name: 'Fabia IV', yearFrom: 2021 },
      ] },
      { slug: 'octavia', name: 'Octavia', generations: [
        { slug: 'octavia-ii', name: 'Octavia II', yearFrom: 2004, yearTo: 2013 },
        { slug: 'octavia-iii', name: 'Octavia III', yearFrom: 2013, yearTo: 2020 },
        { slug: 'octavia-iv', name: 'Octavia IV', yearFrom: 2019 },
      ] },
      { slug: 'superb', name: 'Superb', generations: [{ slug: 'superb-iii', name: 'Superb III', yearFrom: 2015 }] },
      { slug: 'kodiaq', name: 'Kodiaq', generations: [{ slug: 'kodiaq-i', name: 'Kodiaq I', yearFrom: 2016 }] },
      { slug: 'karoq', name: 'Karoq', generations: [{ slug: 'karoq-i', name: 'Karoq', yearFrom: 2017 }] },
    ],
  },
  {
    slug: 'toyota', name: 'Toyota', type: 'CAR',
    models: [
      { slug: 'aygo', name: 'Aygo', generations: [{ slug: 'aygo-ii', name: 'Aygo II', yearFrom: 2014, yearTo: 2022 }] },
      { slug: 'yaris', name: 'Yaris', generations: [
        { slug: 'yaris-iii', name: 'Yaris III', yearFrom: 2011, yearTo: 2020 },
        { slug: 'yaris-iv', name: 'Yaris IV', yearFrom: 2020 },
      ] },
      { slug: 'corolla', name: 'Corolla', generations: [{ slug: 'corolla-xii', name: 'Corolla XII', yearFrom: 2018 }] },
      { slug: 'c-hr', name: 'C-HR', generations: [{ slug: 'c-hr-i', name: 'C-HR I', yearFrom: 2016, yearTo: 2023 }] },
      { slug: 'rav4', name: 'RAV4', generations: [
        { slug: 'rav4-iv', name: 'RAV4 IV', yearFrom: 2012, yearTo: 2018 },
        { slug: 'rav4-v', name: 'RAV4 V', yearFrom: 2018 },
      ] },
    ],
  },
  {
    slug: 'volkswagen', name: 'Volkswagen', type: 'CAR',
    models: [
      { slug: 'polo', name: 'Polo', generations: [
        { slug: 'polo-v', name: 'Polo V (6R)', yearFrom: 2009, yearTo: 2017 },
        { slug: 'polo-vi', name: 'Polo VI (AW)', yearFrom: 2017 },
      ] },
      { slug: 'golf', name: 'Golf', generations: [
        { slug: 'golf-vi', name: 'Golf VI', yearFrom: 2008, yearTo: 2012 },
        { slug: 'golf-vii', name: 'Golf VII', yearFrom: 2012, yearTo: 2020 },
        { slug: 'golf-viii', name: 'Golf VIII', yearFrom: 2019 },
      ] },
      { slug: 'passat', name: 'Passat', generations: [
        { slug: 'passat-b7', name: 'Passat B7', yearFrom: 2010, yearTo: 2014 },
        { slug: 'passat-b8', name: 'Passat B8', yearFrom: 2014, yearTo: 2022 },
      ] },
      { slug: 'tiguan', name: 'Tiguan', generations: [
        { slug: 'tiguan-i', name: 'Tiguan I', yearFrom: 2007, yearTo: 2016 },
        { slug: 'tiguan-ii', name: 'Tiguan II', yearFrom: 2016, yearTo: 2023 },
      ] },
      { slug: 't-roc', name: 'T-Roc', generations: [{ slug: 't-roc-i', name: 'T-Roc', yearFrom: 2017 }] },
      { slug: 'transporter', name: 'Transporter', generations: [
        { slug: 'transporter-t5', name: 'Transporter T5', yearFrom: 2003, yearTo: 2015 },
        { slug: 'transporter-t6', name: 'Transporter T6', yearFrom: 2015 },
      ] },
    ],
  },
  {
    slug: 'volvo', name: 'Volvo', type: 'CAR',
    models: [
      { slug: 'v40', name: 'V40', generations: [{ slug: 'v40-ii', name: 'V40 II', yearFrom: 2012, yearTo: 2019 }] },
      { slug: 'xc40', name: 'XC40', generations: [{ slug: 'xc40-i', name: 'XC40', yearFrom: 2017 }] },
      { slug: 'xc60', name: 'XC60', generations: [
        { slug: 'xc60-i', name: 'XC60 I', yearFrom: 2008, yearTo: 2017 },
        { slug: 'xc60-ii', name: 'XC60 II', yearFrom: 2017 },
      ] },
    ],
  },
]

const DEUX_ROUES: Make[] = [
  {
    slug: 'aprilia', name: 'Aprilia', type: 'MOTORCYCLE',
    models: [
      { slug: 'rs-660', name: 'RS 660', generations: [{ slug: 'rs-660-i', name: 'RS 660', yearFrom: 2020 }] },
      { slug: 'tuono-660', name: 'Tuono 660', generations: [{ slug: 'tuono-660-i', name: 'Tuono 660', yearFrom: 2021 }] },
    ],
  },
  {
    slug: 'bmw-motorrad', name: 'BMW', type: 'MOTORCYCLE',
    models: [
      { slug: 'r-1250-gs', name: 'R 1250 GS', generations: [{ slug: 'r-1250-gs-i', name: 'R 1250 GS', yearFrom: 2018 }] },
      { slug: 's-1000-rr', name: 'S 1000 RR', generations: [{ slug: 's-1000-rr-ii', name: 'S 1000 RR', yearFrom: 2019 }] },
    ],
  },
  {
    slug: 'ducati', name: 'Ducati', type: 'MOTORCYCLE',
    models: [
      { slug: 'monster', name: 'Monster', generations: [{ slug: 'monster-937', name: 'Monster 937', yearFrom: 2021 }] },
      { slug: 'multistrada', name: 'Multistrada', generations: [{ slug: 'multistrada-v4', name: 'Multistrada V4', yearFrom: 2021 }] },
    ],
  },
  {
    slug: 'honda-moto', name: 'Honda', type: 'MOTORCYCLE',
    models: [
      { slug: 'cb500f', name: 'CB500F', generations: [{ slug: 'cb500f-i', name: 'CB500F', yearFrom: 2013 }] },
      { slug: 'cb650r', name: 'CB650R', generations: [{ slug: 'cb650r-i', name: 'CB650R', yearFrom: 2019 }] },
      { slug: 'africa-twin', name: 'Africa Twin', generations: [{ slug: 'africa-twin-crf1100', name: 'CRF1100L Africa Twin', yearFrom: 2020 }] },
      { slug: 'pcx-125', name: 'PCX 125', generations: [{ slug: 'pcx-125-i', name: 'PCX 125', yearFrom: 2010 }] },
    ],
  },
  {
    slug: 'kawasaki', name: 'Kawasaki', type: 'MOTORCYCLE',
    models: [
      { slug: 'z650', name: 'Z650', generations: [{ slug: 'z650-i', name: 'Z650', yearFrom: 2017 }] },
      { slug: 'z900', name: 'Z900', generations: [{ slug: 'z900-i', name: 'Z900', yearFrom: 2017 }] },
      { slug: 'ninja-400', name: 'Ninja 400', generations: [{ slug: 'ninja-400-i', name: 'Ninja 400', yearFrom: 2018 }] },
    ],
  },
  {
    slug: 'ktm', name: 'KTM', type: 'MOTORCYCLE',
    models: [
      { slug: 'duke-390', name: '390 Duke', generations: [{ slug: 'duke-390-i', name: '390 Duke', yearFrom: 2013 }] },
      { slug: 'adventure-890', name: '890 Adventure', generations: [{ slug: 'adventure-890-i', name: '890 Adventure', yearFrom: 2021 }] },
    ],
  },
  {
    slug: 'piaggio', name: 'Piaggio', type: 'MOTORCYCLE',
    models: [
      { slug: 'vespa-primavera', name: 'Vespa Primavera', generations: [{ slug: 'vespa-primavera-i', name: 'Vespa Primavera', yearFrom: 2014 }] },
      { slug: 'mp3', name: 'MP3', generations: [{ slug: 'mp3-iii', name: 'MP3', yearFrom: 2006 }] },
    ],
  },
  {
    slug: 'suzuki-moto', name: 'Suzuki', type: 'MOTORCYCLE',
    models: [
      { slug: 'gsx-r-750', name: 'GSX-R 750', generations: [{ slug: 'gsx-r-750-l1', name: 'GSX-R 750 (L1)', yearFrom: 2011 }] },
      { slug: 'v-strom-650', name: 'V-Strom 650', generations: [{ slug: 'v-strom-650-ii', name: 'V-Strom 650', yearFrom: 2017 }] },
    ],
  },
  {
    slug: 'triumph', name: 'Triumph', type: 'MOTORCYCLE',
    models: [
      { slug: 'street-triple', name: 'Street Triple', generations: [{ slug: 'street-triple-765', name: 'Street Triple 765', yearFrom: 2017 }] },
      { slug: 'tiger-900', name: 'Tiger 900', generations: [{ slug: 'tiger-900-i', name: 'Tiger 900', yearFrom: 2020 }] },
    ],
  },
  {
    slug: 'yamaha', name: 'Yamaha', type: 'MOTORCYCLE',
    models: [
      { slug: 'mt-07', name: 'MT-07', generations: [{ slug: 'mt-07-i', name: 'MT-07', yearFrom: 2014 }] },
      { slug: 'mt-09', name: 'MT-09', generations: [{ slug: 'mt-09-i', name: 'MT-09', yearFrom: 2013 }] },
      { slug: 'tracer-900', name: 'Tracer 900', generations: [{ slug: 'tracer-900-i', name: 'Tracer 900', yearFrom: 2015 }] },
      { slug: 'tmax', name: 'TMAX', generations: [{ slug: 'tmax-560', name: 'TMAX 560', yearFrom: 2020 }] },
    ],
  },
]

async function semerMarque(make: Make) {
  const existante = await prisma.vehicleMake.findUnique({ where: { slug: make.slug }, select: { id: true } })

  const enregistree = existante
    ? await prisma.vehicleMake.update({
        // `active` et `logoMediaId` ne sont pas touchés : la visibilité et le
        // logo se règlent en back-office, pas au seed.
        where: { id: existante.id },
        data: { name: make.name, type: make.type },
      })
    : await prisma.vehicleMake.create({ data: { slug: make.slug, name: make.name, type: make.type } })

  let modelesCrees = 0
  let generationsCreees = 0

  for (const model of make.models) {
    const modeleExistant = await prisma.vehicleModel.findUnique({
      where: { makeId_slug: { makeId: enregistree.id, slug: model.slug } },
      select: { id: true },
    })

    const modele = modeleExistant
      ? await prisma.vehicleModel.update({ where: { id: modeleExistant.id }, data: { name: model.name } })
      : await prisma.vehicleModel.create({ data: { makeId: enregistree.id, slug: model.slug, name: model.name } })

    if (!modeleExistant) modelesCrees += 1

    for (const generation of model.generations) {
      const generationExistante = await prisma.vehicleGeneration.findUnique({
        where: { modelId_slug: { modelId: modele.id, slug: generation.slug } },
        select: { id: true },
      })

      const donnees = {
        name: generation.name,
        yearFrom: generation.yearFrom,
        yearTo: generation.yearTo ?? null,
        phase: generation.phase ?? null,
      }

      if (generationExistante) {
        await prisma.vehicleGeneration.update({ where: { id: generationExistante.id }, data: donnees })
      } else {
        await prisma.vehicleGeneration.create({ data: { modelId: modele.id, slug: generation.slug, ...donnees } })
        generationsCreees += 1
      }
    }
  }

  return { creee: !existante, modelesCrees, generationsCreees }
}

async function main() {
  console.log('→ Référentiel véhicule')

  let marques = 0
  let modeles = 0
  let generations = 0

  for (const make of [...VOITURES, ...DEUX_ROUES]) {
    const bilan = await semerMarque(make)
    if (bilan.creee) marques += 1
    modeles += bilan.modelesCrees
    generations += bilan.generationsCreees
    console.log(
      `  ${bilan.creee ? '+' : '·'} ${make.name}` +
        (bilan.modelesCrees || bilan.generationsCreees
          ? ` — ${bilan.modelesCrees} modèle(s), ${bilan.generationsCreees} génération(s)`
          : ''),
    )
  }

  const [totalMarques, totalModeles, totalGenerations, compatibilites] = await Promise.all([
    prisma.vehicleMake.count(),
    prisma.vehicleModel.count(),
    prisma.vehicleGeneration.count(),
    prisma.fitment.count(),
  ])

  console.log(
    `\n  ${marques} marque(s), ${modeles} modèle(s), ${generations} génération(s) créées.` +
      `\n  En base : ${totalMarques} marques, ${totalModeles} modèles, ${totalGenerations} générations.`,
  )
  console.log(
    `\n  ${compatibilites} compatibilité(s) en base — ce script n'en écrit aucune.` +
      `\n  Une génération sans compatibilité affiche « aucun éclairage documenté », et c'est exact.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
