// Catálogo de alimentos comunes: nombre, emoji, categoría, dónde se guarda (aparato + tipo de zona) y días de caducidad típicos
export const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const RAW = [
  // Lácteos y huevos
  ['Leche', '🥛', 'Lácteos', 'fridge', 'door', 5], ['Leche vegetal', '🥛', 'Lácteos', 'fridge', 'door', 7],
  ['Yogur', '🥛', 'Lácteos', 'fridge', 'shelf', 14], ['Kéfir', '🥛', 'Lácteos', 'fridge', 'shelf', 10],
  ['Queso', '🧀', 'Lácteos', 'fridge', 'shelf', 21], ['Queso fresco', '🧀', 'Lácteos', 'fridge', 'shelf', 5],
  ['Queso rallado', '🧀', 'Lácteos', 'fridge', 'shelf', 14], ['Mantequilla', '🧈', 'Lácteos', 'fridge', 'door', 30],
  ['Nata', '🥛', 'Lácteos', 'fridge', 'door', 4], ['Huevos', '🥚', 'Huevos', 'fridge', 'door', 21],
  // Carne y embutido
  ['Pollo', '🍗', 'Carne', 'fridge', 'shelf', 2], ['Pechuga de pollo', '🍗', 'Carne', 'fridge', 'shelf', 2],
  ['Carne picada', '🥩', 'Carne', 'fridge', 'shelf', 2], ['Ternera', '🥩', 'Carne', 'fridge', 'shelf', 3],
  ['Cerdo', '🥩', 'Carne', 'fridge', 'shelf', 3], ['Pavo', '🦃', 'Carne', 'fridge', 'shelf', 5],
  ['Bacon', '🥓', 'Carne', 'fridge', 'shelf', 7], ['Jamón york', '🍖', 'Embutido', 'fridge', 'shelf', 5],
  ['Jamón serrano', '🍖', 'Embutido', 'fridge', 'shelf', 20], ['Chorizo', '🌭', 'Embutido', 'fridge', 'shelf', 20],
  ['Salchichas', '🌭', 'Carne', 'fridge', 'shelf', 5], ['Fuet', '🌭', 'Embutido', 'fridge', 'shelf', 20],
  // Pescado
  ['Salmón', '🐟', 'Pescado', 'fridge', 'shelf', 2], ['Merluza', '🐟', 'Pescado', 'fridge', 'shelf', 2],
  ['Gambas', '🦐', 'Pescado', 'freezer', 'drawer', 90], ['Atún en lata', '🐟', 'Conservas', 'pantry', 'shelf', 700],
  ['Sardinas en lata', '🐟', 'Conservas', 'pantry', 'shelf', 700], ['Surimi', '🦀', 'Pescado', 'fridge', 'shelf', 7],
  // Verdura
  ['Lechuga', '🥬', 'Verdura', 'fridge', 'drawer', 6], ['Tomate', '🍅', 'Verdura', 'fridge', 'drawer', 7],
  ['Pepino', '🥒', 'Verdura', 'fridge', 'drawer', 7], ['Zanahoria', '🥕', 'Verdura', 'fridge', 'drawer', 21],
  ['Pimiento', '🫑', 'Verdura', 'fridge', 'drawer', 10], ['Calabacín', '🥒', 'Verdura', 'fridge', 'drawer', 7],
  ['Berenjena', '🍆', 'Verdura', 'fridge', 'drawer', 7], ['Brócoli', '🥦', 'Verdura', 'fridge', 'drawer', 5],
  ['Espinacas', '🥬', 'Verdura', 'fridge', 'drawer', 4], ['Champiñones', '🍄', 'Verdura', 'fridge', 'drawer', 5],
  ['Aguacate', '🥑', 'Verdura', 'fridge', 'drawer', 4], ['Maíz', '🌽', 'Verdura', 'pantry', 'shelf', 365],
  ['Cebolla', '🧅', 'Verdura', 'pantry', 'shelf', 30], ['Ajo', '🧄', 'Verdura', 'pantry', 'shelf', 60],
  ['Patatas', '🥔', 'Verdura', 'pantry', 'shelf', 30], ['Puerro', '🥬', 'Verdura', 'fridge', 'drawer', 10],
  // Fruta
  ['Manzana', '🍎', 'Fruta', 'fridge', 'drawer', 21], ['Plátano', '🍌', 'Fruta', 'pantry', 'shelf', 5],
  ['Naranja', '🍊', 'Fruta', 'fridge', 'drawer', 14], ['Mandarina', '🍊', 'Fruta', 'fridge', 'drawer', 14],
  ['Limón', '🍋', 'Fruta', 'fridge', 'drawer', 21], ['Fresas', '🍓', 'Fruta', 'fridge', 'drawer', 3],
  ['Uvas', '🍇', 'Fruta', 'fridge', 'drawer', 7], ['Pera', '🍐', 'Fruta', 'fridge', 'drawer', 10],
  ['Kiwi', '🥝', 'Fruta', 'fridge', 'drawer', 14], ['Melocotón', '🍑', 'Fruta', 'fridge', 'drawer', 5],
  ['Cerezas', '🍒', 'Fruta', 'fridge', 'drawer', 5], ['Arándanos', '🫐', 'Fruta', 'fridge', 'drawer', 7],
  ['Mango', '🥭', 'Fruta', 'pantry', 'shelf', 5], ['Piña', '🍍', 'Fruta', 'pantry', 'shelf', 5],
  ['Melón', '🍈', 'Fruta', 'pantry', 'shelf', 7], ['Sandía', '🍉', 'Fruta', 'pantry', 'shelf', 7],
  // Bebidas
  ['Agua', '💧', 'Bebidas', 'pantry', 'shelf', 365], ['Zumo', '🧃', 'Bebidas', 'fridge', 'door', 7],
  ['Refresco', '🥤', 'Bebidas', 'fridge', 'door', 180], ['Cerveza', '🍺', 'Bebidas', 'fridge', 'door', 180],
  ['Vino', '🍷', 'Bebidas', 'pantry', 'shelf', 365], ['Gazpacho', '🥣', 'Preparados', 'fridge', 'door', 5],
  // Salsas y untables
  ['Ketchup', '🍅', 'Salsas', 'fridge', 'door', 180], ['Mayonesa', '🫙', 'Salsas', 'fridge', 'door', 60],
  ['Mostaza', '🫙', 'Salsas', 'fridge', 'door', 180], ['Tomate frito', '🥫', 'Salsas', 'pantry', 'shelf', 365],
  ['Mermelada', '🍯', 'Untables', 'fridge', 'door', 60], ['Salsa de soja', '🫙', 'Salsas', 'pantry', 'shelf', 365],
  ['Hummus', '🫘', 'Preparados', 'fridge', 'shelf', 5], ['Pesto', '🌿', 'Salsas', 'fridge', 'door', 7],
  // Despensa
  ['Arroz', '🍚', 'Despensa', 'pantry', 'shelf', 365], ['Pasta', '🍝', 'Despensa', 'pantry', 'shelf', 365],
  ['Espaguetis', '🍝', 'Despensa', 'pantry', 'shelf', 365], ['Macarrones', '🍝', 'Despensa', 'pantry', 'shelf', 365],
  ['Harina', '🌾', 'Despensa', 'pantry', 'shelf', 180], ['Azúcar', '🍬', 'Despensa', 'pantry', 'shelf', 700],
  ['Sal', '🧂', 'Despensa', 'pantry', 'shelf', 999], ['Aceite de oliva', '🫒', 'Despensa', 'pantry', 'shelf', 365],
  ['Vinagre', '🫙', 'Despensa', 'pantry', 'shelf', 700], ['Garbanzos', '🫘', 'Legumbres', 'pantry', 'shelf', 365],
  ['Lentejas', '🫘', 'Legumbres', 'pantry', 'shelf', 365], ['Alubias', '🫘', 'Legumbres', 'pantry', 'shelf', 365],
  ['Pan', '🍞', 'Panadería', 'pantry', 'shelf', 3], ['Pan de molde', '🍞', 'Panadería', 'pantry', 'shelf', 10],
  ['Tortillas de trigo', '🫓', 'Panadería', 'pantry', 'shelf', 30], ['Galletas', '🍪', 'Dulces', 'pantry', 'shelf', 90],
  ['Cereales', '🥣', 'Desayuno', 'pantry', 'shelf', 120], ['Café', '☕', 'Desayuno', 'pantry', 'shelf', 180],
  ['Té', '🍵', 'Desayuno', 'pantry', 'shelf', 365], ['Cacao', '🍫', 'Desayuno', 'pantry', 'shelf', 365],
  ['Chocolate', '🍫', 'Dulces', 'pantry', 'shelf', 120], ['Miel', '🍯', 'Untables', 'pantry', 'shelf', 700],
  ['Frutos secos', '🥜', 'Snacks', 'pantry', 'shelf', 120], ['Patatas fritas', '🍟', 'Snacks', 'pantry', 'shelf', 60],
  ['Tomate triturado', '🥫', 'Conservas', 'pantry', 'shelf', 365], ['Caldo', '🥣', 'Despensa', 'pantry', 'shelf', 365],
  ['Avena', '🥣', 'Desayuno', 'pantry', 'shelf', 180], ['Levadura', '🧁', 'Despensa', 'pantry', 'shelf', 180],
  // Congelados
  ['Helado', '🍨', 'Congelados', 'freezer', 'drawer', 180], ['Guisantes', '🫛', 'Congelados', 'freezer', 'drawer', 180],
  ['Pizza', '🍕', 'Congelados', 'freezer', 'drawer', 120], ['Verduras congeladas', '🥦', 'Congelados', 'freezer', 'drawer', 180],
  ['Croquetas', '🧆', 'Congelados', 'freezer', 'drawer', 120], ['Hielo', '🧊', 'Congelados', 'freezer', 'drawer', 365],
  ['Pescado congelado', '🐟', 'Congelados', 'freezer', 'drawer', 180], ['Varitas de merluza', '🐟', 'Congelados', 'freezer', 'drawer', 180],
  ['Carne congelada', '🥩', 'Congelados', 'freezer', 'drawer', 180], ['Patatas congeladas', '🍟', 'Congelados', 'freezer', 'drawer', 180],
  ['Pan congelado', '🥖', 'Congelados', 'freezer', 'drawer', 90],
  // Cocinado en casa
  ['Sobras', '🍲', 'Cocinado', 'fridge', 'shelf', 3], ['Tortilla de patatas', '🍳', 'Cocinado', 'fridge', 'shelf', 3],
  ['Táper de comida', '🍱', 'Cocinado', 'fridge', 'shelf', 3]
];

export const FOODS = RAW.map(([name, emoji, cat, app, kind, days]) => ({ name, emoji, cat, app, kind, days, key: normalize(name) }));

export function searchFoods(q, limit = 6) {
  const n = normalize(q);
  if (!n) return [];
  return FOODS.filter(f => f.key.includes(n))
    .sort((a, b) => a.key.indexOf(n) - b.key.indexOf(n) || a.key.length - b.key.length)
    .slice(0, limit);
}

export function findFood(q) {
  const n = normalize(q);
  if (n.length < 2) return null;
  const sing = w => w.replace(/(es|s)$/, '');
  return FOODS.find(f => f.key === n)
    || FOODS.find(f => n.startsWith(f.key + ' '))
    || FOODS.filter(f => n.split(' ').some(w => w.length > 2 && sing(w) === sing(f.key.split(' ')[0])))
      .sort((a, b) => b.key.length - a.key.length)[0]
    || null;
}

const CAT_EMOJI = [
  ['chees', '🧀'], ['yogurt', '🥛'], ['milk', '🥛'], ['dair', '🥛'], ['egg', '🥚'], ['meat', '🥩'], ['sausage', '🌭'],
  ['ham', '🍖'], ['fish', '🐟'], ['seafood', '🦐'], ['beverage', '🥤'], ['juice', '🧃'], ['beer', '🍺'], ['wine', '🍷'],
  ['water', '💧'], ['bread', '🍞'], ['biscuit', '🍪'], ['cookie', '🍪'], ['chocolate', '🍫'], ['cereal', '🥣'],
  ['pasta', '🍝'], ['rice', '🍚'], ['legume', '🫘'], ['sauce', '🫙'], ['fruit', '🍎'], ['vegetable', '🥦'],
  ['frozen', '🧊'], ['ice-cream', '🍨'], ['snack', '🍿'], ['coffee', '☕'], ['oil', '🫒']
];

export function guessEmoji(name, cats = []) {
  const f = findFood(name);
  if (f) return f.emoji;
  const joined = cats.join(' ');
  const hit = CAT_EMOJI.find(([k]) => joined.includes(k));
  return hit ? hit[1] : '🛒';
}

export const EMOJIS = ['🥛', '🧀', '🧈', '🥚', '🍗', '🥩', '🥓', '🍖', '🌭', '🐟', '🦐', '🥬', '🍅', '🥒', '🥕', '🫑', '🍆', '🥦',
  '🍄', '🥑', '🌽', '🧅', '🧄', '🥔', '🍎', '🍌', '🍊', '🍋', '🍓', '🍇', '🍐', '🥝', '🍑', '🍒', '🫐', '🍍', '🍉', '🍞',
  '🥖', '🍝', '🍚', '🫘', '🥫', '🫙', '🍯', '🍪', '🍫', '🥣', '☕', '🧃', '🥤', '🍺', '🍷', '💧', '🍕', '🍨', '🧊',
  '🍲', '🍱', '🍳', '🥗', '🧂', '🫒', '🥜', '🍟', '🛒'];
