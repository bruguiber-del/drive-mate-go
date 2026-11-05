// Modelos habituales por marca — para el desplegable de modelo que aparece
// en cuanto se elige una marca con lista conocida (ver VehicleManager).
// Las marcas que no aparecen aquí (deportivos/de lujo poco realistas para
// compartir coche, o muy raras en España) se quedan con el campo libre de
// toda la vida — no hace falta una lista para todo.
//
// Los nombres coinciden a propósito con las palabras clave que ya usa
// inferFuelType/inferVehicleCategory en vehiclePricing.ts (p. ej. "208",
// "Ibiza TDI", "Tucson Híbrido"), para que elegir de la lista también
// mejore el acierto de ese cálculo automático, no solo la comodidad.
export const VEHICLE_MODELS_BY_BRAND: Record<string, string[]> = {
  Seat: ["Ibiza", "Ibiza TDI", "León", "León TDI", "Arona", "Ateca", "Tarraco", "Mii"],
  Cupra: ["Formentor", "León", "Born", "Ateca", "Tavascan"],
  Peugeot: ["107", "108", "208", "e-208", "2008", "3008", "308", "408", "508", "5008", "Partner"],
  Citroën: ["C1", "C3", "C3 Aircross", "C4", "C4 Cactus", "C5 Aircross", "Berlingo"],
  "DS Automobiles": ["DS 3", "DS 4", "DS 7"],
  Renault: ["Twingo", "Clio", "Captur", "Mégane", "Scénic", "Kadjar", "Arkana", "Austral", "Zoe", "Kangoo"],
  Dacia: ["Sandero", "Sandero Stepway", "Duster", "Jogger", "Spring"],
  Volkswagen: ["Up", "Polo", "Golf", "T-Cross", "T-Roc", "Tiguan", "Taigo", "Passat", "ID.3", "ID.4", "Caddy"],
  Audi: ["A1", "A3", "A4", "A5", "A6", "Q2", "Q3", "Q5", "Q7", "e-tron"],
  BMW: ["Serie 1", "Serie 2", "Serie 3", "Serie 4", "Serie 5", "X1", "X2", "X3", "X5", "i3", "i4"],
  "Mercedes-Benz": ["Clase A", "Clase B", "Clase C", "Clase E", "CLA", "GLA", "GLB", "GLC", "EQA"],
  Mini: ["Mini Cooper", "Mini Clubman", "Mini Countryman"],
  Toyota: ["Aygo", "Yaris", "Yaris Hybrid", "Corolla", "Corolla Hybrid", "C-HR", "RAV4", "Prius", "Auris"],
  Lexus: ["CT", "UX", "NX", "RX"],
  Honda: ["Jazz", "Civic", "CR-V", "HR-V"],
  Nissan: ["Micra", "Note", "Juke", "Qashqai", "X-Trail", "Leaf"],
  Mazda: ["Mazda2", "Mazda3", "CX-3", "CX-5", "CX-30", "MX-5"],
  Suzuki: ["Swift", "Vitara", "S-Cross", "Ignis", "Jimny"],
  Mitsubishi: ["Space Star", "ASX", "Eclipse Cross", "Outlander"],
  Subaru: ["Impreza", "XV", "Forester", "Outback"],
  Hyundai: ["i10", "i20", "i30", "Kona", "Tucson", "Tucson Híbrido", "Santa Fe", "Ioniq"],
  Kia: ["Picanto", "Rio", "Ceed", "Stonic", "Sportage", "Sorento", "Niro", "EV6"],
  Ford: ["Ka+", "Fiesta", "Focus", "Puma", "Kuga", "EcoSport", "Mondeo"],
  Opel: ["Corsa", "Astra", "Mokka", "Crossland", "Grandland", "Insignia"],
  Fiat: ["Panda", "500", "500X", "Tipo", "Punto"],
  Abarth: ["500", "595"],
  "Alfa Romeo": ["Giulietta", "Giulia", "Stelvio", "Tonale"],
  Lancia: ["Ypsilon"],
  Škoda: ["Fabia", "Scala", "Octavia", "Kamiq", "Karoq", "Kodiaq", "Enyaq"],
  Volvo: ["V40", "V60", "XC40", "XC60", "XC90"],
  Jeep: ["Renegade", "Compass", "Cherokee", "Wrangler"],
  "Land Rover": ["Evoque", "Discovery Sport", "Discovery", "Defender"],
  Tesla: ["Model 3", "Model Y", "Model S", "Model X"],
  Polestar: ["Polestar 2"],
  MG: ["MG3", "ZS", "HS", "MG4"],
  BYD: ["Dolphin", "Atto 3", "Seal"],
  Smart: ["Fortwo", "Forfour"],
  SsangYong: ["Tivoli", "Korando"],
};
