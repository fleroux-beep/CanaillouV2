/**
 * Mapping code département → slugs région/département pour SeLoger B&C.
 * Utilise les anciennes régions (pré-réforme 2016), correspondant aux URLs du site.
 */

interface DeptInfo {
  region: string;
  dept: string;
}

const DEPT_MAP: Record<string, DeptInfo> = {
  "01": { region: "rhone-alpes", dept: "ain" },
  "02": { region: "picardie", dept: "aisne" },
  "03": { region: "auvergne", dept: "allier" },
  "04": { region: "provence-alpes-cote-d-azur", dept: "alpes-de-haute-provence" },
  "05": { region: "provence-alpes-cote-d-azur", dept: "hautes-alpes" },
  "06": { region: "provence-alpes-cote-d-azur", dept: "alpes-maritimes" },
  "07": { region: "rhone-alpes", dept: "ardeche" },
  "08": { region: "champagne-ardenne", dept: "ardennes" },
  "09": { region: "midi-pyrenees", dept: "ariege" },
  "10": { region: "champagne-ardenne", dept: "aube" },
  "11": { region: "languedoc-roussillon", dept: "aude" },
  "12": { region: "midi-pyrenees", dept: "aveyron" },
  "13": { region: "provence-alpes-cote-d-azur", dept: "bouches-du-rhone" },
  "14": { region: "basse-normandie", dept: "calvados" },
  "15": { region: "auvergne", dept: "cantal" },
  "16": { region: "poitou-charentes", dept: "charente" },
  "17": { region: "poitou-charentes", dept: "charente-maritime" },
  "18": { region: "centre", dept: "cher" },
  "19": { region: "limousin", dept: "correze" },
  "21": { region: "bourgogne", dept: "cote-d-or" },
  "22": { region: "bretagne", dept: "cotes-d-armor" },
  "23": { region: "limousin", dept: "creuse" },
  "24": { region: "aquitaine", dept: "dordogne" },
  "25": { region: "franche-comte", dept: "doubs" },
  "26": { region: "rhone-alpes", dept: "drome" },
  "27": { region: "haute-normandie", dept: "eure" },
  "28": { region: "centre", dept: "eure-et-loir" },
  "29": { region: "bretagne", dept: "finistere" },
  "2A": { region: "corse", dept: "corse-du-sud" },
  "2B": { region: "corse", dept: "haute-corse" },
  "30": { region: "languedoc-roussillon", dept: "gard" },
  "31": { region: "midi-pyrenees", dept: "haute-garonne" },
  "32": { region: "midi-pyrenees", dept: "gers" },
  "33": { region: "aquitaine", dept: "gironde" },
  "34": { region: "languedoc-roussillon", dept: "herault" },
  "35": { region: "bretagne", dept: "ille-et-vilaine" },
  "36": { region: "centre", dept: "indre" },
  "37": { region: "centre", dept: "indre-et-loire" },
  "38": { region: "rhone-alpes", dept: "isere" },
  "39": { region: "franche-comte", dept: "jura" },
  "40": { region: "aquitaine", dept: "landes" },
  "41": { region: "centre", dept: "loir-et-cher" },
  "42": { region: "rhone-alpes", dept: "loire" },
  "43": { region: "auvergne", dept: "haute-loire" },
  "44": { region: "pays-de-la-loire", dept: "loire-atlantique" },
  "45": { region: "centre", dept: "loiret" },
  "46": { region: "midi-pyrenees", dept: "lot" },
  "47": { region: "aquitaine", dept: "lot-et-garonne" },
  "48": { region: "languedoc-roussillon", dept: "lozere" },
  "49": { region: "pays-de-la-loire", dept: "maine-et-loire" },
  "50": { region: "basse-normandie", dept: "manche" },
  "51": { region: "champagne-ardenne", dept: "marne" },
  "52": { region: "champagne-ardenne", dept: "haute-marne" },
  "53": { region: "pays-de-la-loire", dept: "mayenne" },
  "54": { region: "lorraine", dept: "meurthe-et-moselle" },
  "55": { region: "lorraine", dept: "meuse" },
  "56": { region: "bretagne", dept: "morbihan" },
  "57": { region: "lorraine", dept: "moselle" },
  "58": { region: "bourgogne", dept: "nievre" },
  "59": { region: "nord-pas-de-calais", dept: "nord" },
  "60": { region: "picardie", dept: "oise" },
  "61": { region: "basse-normandie", dept: "orne" },
  "62": { region: "nord-pas-de-calais", dept: "pas-de-calais" },
  "63": { region: "auvergne", dept: "puy-de-dome" },
  "64": { region: "aquitaine", dept: "pyrenees-atlantiques" },
  "65": { region: "midi-pyrenees", dept: "hautes-pyrenees" },
  "66": { region: "languedoc-roussillon", dept: "pyrenees-orientales" },
  "67": { region: "alsace", dept: "bas-rhin" },
  "68": { region: "alsace", dept: "haut-rhin" },
  "69": { region: "rhone-alpes", dept: "rhone" },
  "70": { region: "franche-comte", dept: "haute-saone" },
  "71": { region: "bourgogne", dept: "saone-et-loire" },
  "72": { region: "pays-de-la-loire", dept: "sarthe" },
  "73": { region: "rhone-alpes", dept: "savoie" },
  "74": { region: "rhone-alpes", dept: "haute-savoie" },
  "75": { region: "ile-de-france", dept: "paris" },
  "76": { region: "haute-normandie", dept: "seine-maritime" },
  "77": { region: "ile-de-france", dept: "seine-et-marne" },
  "78": { region: "ile-de-france", dept: "yvelines" },
  "79": { region: "poitou-charentes", dept: "deux-sevres" },
  "80": { region: "picardie", dept: "somme" },
  "81": { region: "midi-pyrenees", dept: "tarn" },
  "82": { region: "midi-pyrenees", dept: "tarn-et-garonne" },
  "83": { region: "provence-alpes-cote-d-azur", dept: "var" },
  "84": { region: "provence-alpes-cote-d-azur", dept: "vaucluse" },
  "85": { region: "pays-de-la-loire", dept: "vendee" },
  "86": { region: "poitou-charentes", dept: "vienne" },
  "87": { region: "limousin", dept: "haute-vienne" },
  "88": { region: "lorraine", dept: "vosges" },
  "89": { region: "bourgogne", dept: "yonne" },
  "90": { region: "franche-comte", dept: "territoire-de-belfort" },
  "91": { region: "ile-de-france", dept: "essonne" },
  "92": { region: "ile-de-france", dept: "hauts-de-seine" },
  "93": { region: "ile-de-france", dept: "seine-saint-denis" },
  "94": { region: "ile-de-france", dept: "val-de-marne" },
  "95": { region: "ile-de-france", dept: "val-d-oise" },
  // DOM-TOM
  "971": { region: "guadeloupe", dept: "guadeloupe" },
  "972": { region: "martinique", dept: "martinique" },
  "973": { region: "guyane", dept: "guyane" },
  "974": { region: "la-reunion", dept: "la-reunion" },
  "976": { region: "mayotte", dept: "mayotte" },
};

/**
 * Résout les slugs région/département à partir d'un code postal.
 * Retourne null si le code postal n'est pas reconnu.
 */
export function getDeptInfo(codePostal: string): DeptInfo | null {
  const cp = codePostal.trim();

  // DOM-TOM : 3 premiers chiffres
  if (cp.startsWith("97")) {
    return DEPT_MAP[cp.substring(0, 3)] || null;
  }

  // Corse : 2A/2B
  if (cp.startsWith("20")) {
    // 20000-20190 = Corse-du-Sud (2A), 20200-20290 = Haute-Corse (2B)
    const num = parseInt(cp, 10);
    return num < 20200 ? DEPT_MAP["2A"] : DEPT_MAP["2B"];
  }

  // Métropole : 2 premiers chiffres
  return DEPT_MAP[cp.substring(0, 2)] || null;
}
