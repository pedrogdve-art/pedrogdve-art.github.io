// Recetas caseras sencillas. Formato de ingrediente: "Etiqueta:clave1|clave2", con "?" delante = opcional
import { normalize } from './foods.js';

const parse = s => {
  const opt = s.startsWith('?');
  const [label, keys] = s.replace(/^\?/, '').split(':');
  return { label, keys: (keys || label).split('|').map(normalize), opt };
};
const R = (id, name, emoji, time, ings, steps) => ({ id, name, emoji, time, ings: ings.map(parse), steps });

export const RECIPES = [
  R('tortilla', 'Tortilla de patatas', '🍳', 35, ['Huevos:huevo', 'Patatas:patata', '?Cebolla:cebolla'],
    ['Pela y corta las patatas (y la cebolla) en láminas finas.', 'Fríelas a fuego medio en abundante aceite hasta que estén tiernas.', 'Escúrrelas y mézclalas con los huevos batidos y sal.', 'Cuaja en la sartén por ambos lados, dándole la vuelta con un plato.']),
  R('huevos-rotos', 'Huevos rotos con jamón', '🍳', 25, ['Huevos:huevo', 'Patatas:patata', 'Jamón:jamon'],
    ['Fríe las patatas cortadas en bastones.', 'Fríe los huevos dejando la yema líquida.', 'Pon los huevos sobre las patatas con el jamón y rompe las yemas.']),
  R('macarrones', 'Macarrones con tomate', '🍝', 20, ['Pasta:pasta|macarron|espagueti', 'Tomate frito:tomate frito|tomate triturado|tomate', '?Chorizo:chorizo', '?Queso:queso'],
    ['Cuece la pasta en agua con sal.', 'Sofríe el chorizo troceado y añade el tomate.', 'Mezcla con la pasta escurrida y cubre con queso. Gratina si quieres.']),
  R('cubana', 'Arroz a la cubana', '🍚', 25, ['Arroz:arroz', 'Huevos:huevo', 'Tomate frito:tomate', '?Plátano:platano'],
    ['Cuece el arroz y escúrrelo.', 'Fríe los huevos (y el plátano en rodajas).', 'Sirve el arroz con el tomate caliente y los huevos encima.']),
  R('ensalada', 'Ensalada mixta', '🥗', 10, ['Lechuga:lechuga', 'Tomate:tomate', '?Cebolla:cebolla', '?Atún:atun', '?Huevo:huevo', '?Maíz:maiz'],
    ['Lava y corta la lechuga y el tomate.', 'Añade el resto de ingredientes troceados.', 'Aliña con aceite, vinagre y sal.']),
  R('gazpacho', 'Gazpacho', '🥣', 15, ['Tomate:tomate', 'Pepino:pepino', 'Pimiento:pimiento', 'Ajo:ajo', '?Pan:pan'],
    ['Trocea todas las verduras.', 'Tritura con aceite, vinagre, sal y un poco de agua.', 'Cuela si quieres y enfría bien en la nevera.']),
  R('pollo-ajillo', 'Pollo al ajillo', '🍗', 30, ['Pollo:pollo|pechuga', 'Ajo:ajo', '?Limón:limon'],
    ['Salpimienta el pollo troceado.', 'Dóralo en aceite con los ajos laminados.', 'Añade un chorrito de agua o vino y limón y deja reducir.']),
  R('crema-calabacin', 'Crema de calabacín', '🥣', 30, ['Calabacín:calabacin', 'Cebolla:cebolla|puerro', '?Patata:patata', '?Quesito:queso'],
    ['Pocha la cebolla en una olla.', 'Añade el calabacín y la patata troceados y cubre de agua.', 'Cuece 20 min, añade el queso y tritura.']),
  R('lentejas', 'Lentejas estofadas', '🫘', 45, ['Lentejas:lenteja', 'Zanahoria:zanahoria', 'Cebolla:cebolla', '?Chorizo:chorizo', '?Patata:patata', '?Pimiento:pimiento'],
    ['Pon las lentejas en la olla con agua fría.', 'Añade las verduras troceadas y el chorizo.', 'Cuece a fuego lento unos 40 min. Sal al final.']),
  R('salmon-horno', 'Salmón al horno con verduras', '🐟', 30, ['Salmón:salmon', 'Patatas:patata', '?Calabacín:calabacin', '?Limón:limon'],
    ['Corta las patatas en rodajas finas y hornéalas 10 min a 200 °C.', 'Añade el salmón y el calabacín con sal y aceite.', 'Hornea 15 min más y sirve con limón.']),
  R('tostada-aguacate', 'Tostadas de aguacate', '🥑', 10, ['Pan:pan', 'Aguacate:aguacate', '?Tomate:tomate', '?Huevo:huevo'],
    ['Tuesta el pan.', 'Machaca el aguacate con sal y limón.', 'Úntalo y añade tomate o un huevo a la plancha.']),
  R('batido', 'Batido de frutas', '🥤', 5, ['Plátano:platano', 'Leche o yogur:leche|yogur|kefir', '?Fresas:fresa', '?Avena:avena'],
    ['Trocea la fruta.', 'Tritura todo junto hasta que quede cremoso.']),
  R('revuelto', 'Revuelto de champiñones', '🍳', 15, ['Huevos:huevo', 'Champiñones:champinon', '?Ajo:ajo', '?Jamón:jamon'],
    ['Saltea los champiñones laminados con ajo.', 'Añade el jamón y después los huevos batidos.', 'Remueve a fuego suave hasta que cuajen jugosos.']),
  R('carbonara', 'Espaguetis carbonara', '🍝', 20, ['Pasta:espagueti|pasta|macarron', 'Bacon:bacon|panceta', 'Huevos:huevo', 'Queso:queso'],
    ['Cuece la pasta.', 'Dora el bacon en una sartén.', 'Fuera del fuego, mezcla la pasta con el bacon, el huevo batido y el queso.']),
  R('sandwich', 'Sándwich mixto', '🥪', 10, ['Pan de molde:pan', 'Jamón york:jamon york|jamon|pavo', 'Queso:queso', '?Mantequilla:mantequilla'],
    ['Monta el sándwich con jamón y queso.', 'Unta por fuera con mantequilla.', 'Tuéstalo en sartén por ambos lados.']),
  R('tortitas', 'Tortitas', '🥞', 20, ['Harina:harina', 'Leche:leche', 'Huevos:huevo', '?Azúcar:azucar', '?Miel:miel|mermelada|chocolate'],
    ['Bate la harina, la leche, el huevo y el azúcar.', 'Vierte porciones en sartén caliente con un poco de mantequilla.', 'Dales la vuelta cuando salgan burbujas. Sirve con miel.']),
  R('pisto', 'Pisto', '🍅', 40, ['Calabacín:calabacin', 'Pimiento:pimiento', 'Tomate:tomate', 'Cebolla:cebolla', '?Berenjena:berenjena', '?Huevo:huevo'],
    ['Pocha la cebolla y el pimiento.', 'Añade la berenjena y el calabacín en dados.', 'Incorpora el tomate y cocina 20 min. Puedes servirlo con huevo.']),
  R('brocoli', 'Brócoli salteado al ajillo', '🥦', 15, ['Brócoli:brocoli', 'Ajo:ajo', '?Bacon:bacon'],
    ['Cuece el brócoli 3 min.', 'Saltéalo con aceite, ajo laminado y bacon.']),
  R('wraps', 'Wraps de pollo', '🌯', 20, ['Tortillas:tortilla', 'Pollo:pollo|pechuga|pavo', 'Lechuga:lechuga', '?Tomate:tomate', '?Queso:queso'],
    ['Haz el pollo a la plancha en tiras.', 'Rellena las tortillas con pollo, lechuga y tomate.', 'Enróllalas y tuéstalas un minuto.'])
];

export function matchRecipe(r, items, isUrgent) {
  const have = [], missing = [], urgent = [];
  for (const ing of r.ings) {
    const it = items.find(i => {
      const n = normalize(i.name);
      return ing.keys.some(k => n === k || n.startsWith(k) || n.includes(' ' + k));
    });
    if (it) { have.push({ ing, item: it }); if (isUrgent(it)) urgent.push(it); }
    else missing.push(ing);
  }
  const totalReq = r.ings.filter(i => !i.opt).length;
  const haveReq = have.filter(h => !h.ing.opt).length;
  return { r, have, missing, urgent, haveReq, totalReq, pct: totalReq ? haveReq / totalReq : 0, ready: haveReq === totalReq };
}
