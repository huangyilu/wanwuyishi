/**
 * 城市风景图。
 *
 * 所有图片来源 Wikimedia Commons，仅采用允许再分发的自由版权（CC0 / CC-BY / CC-BY-SA / 公有领域）。
 * 完整署名（作者、许可、来源页）见 public/img/cities/credits.json。
 */
export interface CityImage {
  src: string;
  author: string;
  license: string;
  page: string;
}

export const CITY_IMAGES: Record<string, CityImage> = {
  'city-paris': {
    src: 'img/cities/city-paris.jpg',
    author: 'Renée Kools',
    license: 'CC BY 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Paris_skyline_from_Montmartre_2026-01-03.jpg',
  },
  'city-rome': {
    src: 'img/cities/city-rome.jpg',
    author: 'Sonse',
    license: 'CC BY 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Skyline_of_Rome_from_Castel_Sant%27Angelo_(45704460365).jpg',
  },
  'city-florence': {
    src: 'img/cities/city-florence.jpg',
    author: 'Bely Medved',
    license: 'CC BY-SA 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Panorama_of_the_Florence_skyline_at_sunset.jpg',
  },
  'city-lucerne': {
    src: 'img/cities/city-lucerne.jpg',
    author: 'Norbert Nagel',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Landscape_Panorama_at_Hergiswil_near_Willisau_-_Lucerne_-_Switzerland_-_01.jpg',
  },

  // ---- 新增 ----
  'city-milan': {
    src: 'img/cities/city-milan.jpg',
    author: 'Daniel Case',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Full_Milan_skyline_from_Duomo_roof.jpg',
  },
  'city-venice': {
    src: 'img/cities/city-venice.jpg',
    author: 'Benh LIEU SONG',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Piazzetta_San_Marco_Venice_BLS.jpg',
  },
  'city-naples': {
    src: 'img/cities/city-naples.jpg',
    author: 'PaestumPaestum',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Vesuvio_e_nave_a_Napoli.jpg',
  },
  'city-pompeii': {
    src: 'img/cities/city-pompeii.jpg',
    author: 'Commonists',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Stones_on_Via_di_Castricio_(Pompeii).jpg',
  },
  'city-capri': {
    src: 'img/cities/city-capri.jpg',
    author: 'Wolfgang Moroder',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Costa_settentrionale_Marina_Grande_Capri.jpg',
  },
  'city-dolomites': {
    src: 'img/cities/city-dolomites.jpg',
    author: 'Wolfgang Moroder',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Saslonch_y_Sela_da_Mont_S%C3%ABuc.jpg',
  },
  'city-interlaken': {
    src: 'img/cities/city-interlaken.jpg',
    author: 'Ank Kumar',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:River_Aare_in_Interlaken,_Switzerland_(Ank_Kumar)_02.jpg',
  },
  'city-zermatt': {
    src: 'img/cities/city-zermatt.jpg',
    author: 'flamouroux',
    license: 'CC BY-SA 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Zermatt_Panorama.jpg',
  },
  // ---- 南法新增（图需 scripts/fetch-south-france-images.sh 下载） ----
  'city-nice': {
    src: 'img/cities/city-nice.jpg',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Nice_panorama.jpg',
  },
  'city-cannes': {
    src: 'img/cities/city-cannes.jpg',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Cannes_Panorama.jpg',
  },
  'city-marseille': {
    src: 'img/cities/city-marseille.jpg',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Marseille_Panorama.jpg',
  },
  'city-avignon': {
    src: 'img/cities/city-avignon.jpg',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Avignon_Panorama.jpg',
  },
  'city-saint-paul': {
    src: 'img/cities/city-saint-paul.jpg',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Saint-Paul-de-Vence.jpg',
  },

  // ---- 埃及新增（图经 wsrv.nl 代理自 Wikimedia Commons 下载） ----
  'city-cairo': {
    src: 'img/cities/city-cairo.jpg',
    author: 'kallerna',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:View_over_Cairo_from_Citadel.jpg',
  },
  'city-giza': {
    src: 'img/cities/city-giza.jpg',
    author: 'kallerna',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Sphinx_and_the_Great_Pyramid_of_Giza_panorama.jpg',
  },
  'city-luxor': {
    src: 'img/cities/city-luxor.jpg',
    author: 'Roland Unger',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:LuxorTemplePanorama.jpg',
  },
  'city-aswan': {
    src: 'img/cities/city-aswan.jpg',
    author: 'Marc Ryckaert (MJJR)',
    license: 'CC BY 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Aswan_Nile_Panorama_R01.jpg',
  },
  'city-alexandria': {
    src: 'img/cities/city-alexandria.jpg',
    author: 'Vyacheslav Argenberg',
    license: 'CC BY 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Egypt,_Alexandria,_The_Corniche_of_Alexandria,_Mediterranean_Sea.jpg',
  },
};

export function cityImage(cityId: string): CityImage | undefined {
  return CITY_IMAGES[cityId];
}
