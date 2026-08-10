/**
 * 景点（POI）配图。
 *
 * 所有图片来源 Wikimedia Commons，仅采用允许再分发的自由版权（CC0 / CC-BY / CC-BY-SA / 公有领域）。
 * 完整署名（作者、许可、来源页）见 public/img/pois/credits.json。
 * 与城市图一致，采用独立映射，不污染世界库数据文件。
 */
export interface PoiImage {
  src: string;
  author: string;
  license: string;
  page: string;
}

export const POI_IMAGES: Record<string, PoiImage> = {
  // ---- 既有（法国 / 罗马 / 卢塞恩） ----
  'poi-louvre': {
    src: '/img/pois/poi-louvre.jpg',
    author: 'Arunkumar Vijayan',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Cour_Carrée_du_Louvre_in_2019.jpg',
  },
  'poi-colosseum': {
    src: '/img/pois/poi-colosseum.jpg',
    author: 'Wilfredor',
    license: 'CC0',
    page: 'https://commons.wikimedia.org/wiki/File:Colosseum_of_Rome_and_Roman_forum.jpg',
  },
  'poi-eiffel-tower': {
    src: '/img/pois/poi-eiffel-tower.jpg',
    author: 'Maksim Sokolov',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Eiffel_Tower_in_2022_02.jpg',
  },
  'poi-vatican-museums': {
    src: '/img/pois/poi-vatican-museums.jpg',
    author: 'Deb Nystrom',
    license: 'CC BY 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Courtyard,_Vatican_Museum_(45510285915).jpg',
  },
  'poi-uffizi': {
    src: '/img/pois/poi-uffizi.jpg',
    author: 'Diego Delso',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Galería_Uffizi,_Florencia,_Italia,_2022-09-18,_DD_29.jpg',
  },
  'poi-duomo-florence': {
    src: '/img/pois/poi-duomo-florence.jpg',
    author: 'Dllu',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Florence_Cathedral_seen_from_Piazzale_Michelangelo_night_dllu.jpg',
  },
  'poi-orsay': {
    src: '/img/pois/poi-orsay.jpg',
    author: 'DXR',
    license: 'CC BY-SA 3.0',
    page: "https://commons.wikimedia.org/wiki/File:Musee_d'Orsay_and_Pont_Royal,_North-West_view_140402_1.jpg",
  },
  'poi-pantheon-rome': {
    src: '/img/pois/poi-pantheon-rome.jpg',
    author: 'NikonZ7II',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Pantheon_(Rome)_-_Right_side_and_front.jpg',
  },
  'poi-mount-pilatus': {
    src: '/img/pois/poi-mount-pilatus.jpg',
    author: 'Liridon',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Luzern_-_Mount_Pilatus_-_March_2019_(01).jpg',
  },
  'poi-chapel-bridge': {
    src: '/img/pois/poi-chapel-bridge.jpg',
    author: 'Ymblanter',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Lucerne_Kapellbrücke_and_Wasserturm_from_the_west.jpg',
  },
  'poi-sainte-chapelle': {
    src: '/img/pois/poi-sainte-chapelle.jpg',
    author: 'Oldmanisold',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Sainte_Chapelle_Interior_Stained_Glass.jpg',
  },

  // ---- 佛罗伦萨补充 ----
  'poi-accademia': {
    src: '/img/pois/poi-accademia.jpg',
    author: 'Commonists',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Michelangelo%27s_David_-_right_view_2.jpg',
  },
  'poi-ponte-vecchio': {
    src: '/img/pois/poi-ponte-vecchio.jpg',
    author: 'Jan Drewes',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Panorama_of_the_Ponte_Vecchio_in_Florence,_Italy.jpg',
  },
  'poi-piazzale-michelangelo': {
    src: '/img/pois/poi-piazzale-michelangelo.jpg',
    author: 'Wikibusters',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Panorama_of_Florence_from_Piazzale_Michelangelo.jpg',
  },

  // ---- 米兰 ----
  'poi-duomo-milano': {
    src: '/img/pois/poi-duomo-milano.jpg',
    author: 'Leonhard Lenz',
    license: 'CC0',
    page: 'https://commons.wikimedia.org/wiki/File:Duomo_di_Milano_2022-09-28_08.jpg',
  },
  'poi-last-supper': {
    src: '/img/pois/poi-last-supper.jpg',
    author: 'Leonardo da Vinci',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg',
  },
  'poi-galleria-vittorio': {
    src: '/img/pois/poi-galleria-vittorio.jpg',
    author: 'Terragio67',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:The_glass_dome_-_Galleria_Vittorio_Emanuele_II_-_Milan.jpg',
  },
  'poi-sforza-castle': {
    src: '/img/pois/poi-sforza-castle.jpg',
    author: 'Terragio67',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Castello_Sforzesco_(Milano)_-_Portico_dell_Elefante.jpg',
  },
  'poi-pinacoteca-brera': {
    src: '/img/pois/poi-pinacoteca-brera.jpg',
    author: 'Rijksmuseum',
    license: 'CC0',
    page: 'https://commons.wikimedia.org/wiki/File:Binnenplaats_van_de_Pinacoteca_di_Brera_te_Milaan,_RP-F-2001-7-1023-49.jpg',
  },

  // ---- 威尼斯 ----
  'poi-san-marco': {
    src: '/img/pois/poi-san-marco.jpg',
    author: 'Wolfgang Moroder',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Panorama_Piazza_San_Marco_and_Venice_on_Easter_2013.jpg',
  },
  'poi-st-marks-basilica': {
    src: '/img/pois/poi-st-marks-basilica.jpg',
    author: 'Didier Descouens',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:(Venice)_Doge%27s_Palace_and_campanile_of_St._Mark%27s_Basilica_facing_the_sea.jpg',
  },
  'poi-doge-palace': {
    src: '/img/pois/poi-doge-palace.jpg',
    author: 'Benh LIEU SONG',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Piazzetta_San_Marco_Venice_BLS.jpg',
  },
  'poi-rialto-bridge': {
    src: '/img/pois/poi-rialto-bridge.jpg',
    author: 'Wolfgang Moroder',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Ponte_di_Rialto_facciata_ovest_di_sera.jpg',
  },
  'poi-bridge-of-sighs': {
    src: '/img/pois/poi-bridge-of-sighs.jpg',
    author: 'kallerna',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Bridge_of_Sighs_sea_facade_Venice.jpg',
  },

  // ---- 那不勒斯 / 庞贝 / 卡普里 ----
  'poi-mann': {
    src: '/img/pois/poi-mann.jpg',
    author: 'Phyrexian',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Napoli_-_Museo_archeologico_nazionale_3903.jpg',
  },
  'poi-castel-dellovo': {
    src: '/img/pois/poi-castel-dellovo.jpg',
    author: 'PaestumPaestum',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Castel_dell%27_ovo.jpg',
  },
  'poi-galleria-umberto': {
    src: '/img/pois/poi-galleria-umberto.jpg',
    author: 'Wolfgang Moroder',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Galleria_Umberto_I_Napoli_timpano_con_angeli.jpg',
  },
  'poi-vesuvius': {
    src: '/img/pois/poi-vesuvius.jpg',
    author: 'Ekrem Canli',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Vesuvius_from_Monte_Somma_(Panorama_II).jpg',
  },
  'poi-pompeii': {
    src: '/img/pois/poi-pompeii.jpg',
    author: 'Commonists',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Ancient_Roman_frescos_in_Casa_del_Criptoportico_(Pompeii).jpg',
  },
  'poi-blue-grotto': {
    src: '/img/pois/poi-blue-grotto.jpg',
    author: 'Elenagm',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Grotta_azzurra.capri.JPG',
  },
  'poi-gardens-augustus': {
    src: '/img/pois/poi-gardens-augustus.jpg',
    author: 'Jenny',
    license: 'CC BY 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Isle_of_Capri_9.jpg',
  },

  // ---- 多洛米蒂 ----
  'poi-tre-cime': {
    src: '/img/pois/poi-tre-cime.jpg',
    author: 'Wolfgang Moroder',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Drei_Zinnen_Tre_Cime_di_Lavaredo_Dolomites.jpg',
  },
  'poi-seceda': {
    src: '/img/pois/poi-seceda.jpg',
    author: 'Wolfgang Moroder',
    license: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Odles_Seceda_Saslonch_da_Resciesa_dedite.jpg',
  },
  'poi-val-di-funes': {
    src: '/img/pois/poi-val-di-funes.jpg',
    author: 'Wolfgang Moroder',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Sass_de_Putia_Odle_di_Eores_Serighelamoos_B%C3%B6rz_Val_Badia.jpg',
  },
  'poi-lago-misurina': {
    src: '/img/pois/poi-lago-misurina.jpg',
    author: 'KlausFoehl',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Lago_di_Misurina_panoramic01_2019-01-11.jpg',
  },

  // ---- 瑞士：因特拉肯 / 采尔马特 ----
  'poi-jungfraujoch': {
    src: '/img/pois/poi-jungfraujoch.jpg',
    author: 'VasuVR',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Jungfrau_ViewFrom_EigenGlatscher_SL41_12L11R_small.jpg',
  },
  'poi-harder-kulm': {
    src: '/img/pois/poi-harder-kulm.jpg',
    author: 'Ank Kumar',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:View_of_Interlaken_and_Lake_Brienz_from_Harder_Kulm_(Ank_Kumar)_02.jpg',
  },
  'poi-schilthorn': {
    src: '/img/pois/poi-schilthorn.jpg',
    author: 'Ank Kumar',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Schilthorn_Cable_Car,_Swiss_Alps_(Ank_Kumar)_04.jpg',
  },
  'poi-lake-brienz': {
    src: '/img/pois/poi-lake-brienz.jpg',
    author: 'Andrew Bossi',
    license: 'CC BY-SA 2.5',
    page: 'https://commons.wikimedia.org/wiki/File:5528-5531_-_Oberried_and_Brienz_on_the_Brienzersee_-_toneadj.JPG',
  },
  'poi-lake-thun': {
    src: '/img/pois/poi-lake-thun.jpg',
    author: 'MartySwissCH',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Lake_Thun_Panorama_2022_(view_from_Niesen).jpg',
  },
  'poi-matterhorn': {
    src: '/img/pois/poi-matterhorn.jpg',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:CH.VS.Zermatt_Sunnegga_Grindjisee_Matterhorn_9034_16x9-R_16K.jpg',
  },
  'poi-gornergrat': {
    src: '/img/pois/poi-gornergrat.jpg',
    author: 'Ka23 13',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Gornergrat_20130701_211902.jpg',
  },
};

export function poiImage(poiId: string): PoiImage | undefined {
  return POI_IMAGES[poiId];
}
