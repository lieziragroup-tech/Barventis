import { DemoMenuPreset } from "./types";

export const DEMO_PRESETS: DemoMenuPreset[] = [
  {
    id: "kopi-susu-aren",
    name: "Kopi Susu Gula Aren (Signature)",
    category: "coffee",
    portions: 10,
    targetPrice: 22000,
    ingredients: [
      { id: "1", name: "Espresso Blend (Gayo/Toraja)", quantity: 180, unit: "gram", price: 45000 },
      { id: "2", name: "Fresh Milk (Pasteurised)", quantity: 1200, unit: "ml", price: 34000 },
      { id: "3", name: "Gula Aren Cair Organik", quantity: 200, unit: "ml", price: 12000 },
      { id: "4", name: "Paper Cup & Straw Custom", quantity: 10, unit: "pcs", price: 8500 },
      { id: "5", name: "Es Batu (Ice Tube)", quantity: 1000, unit: "gram", price: 3000 }
    ]
  },
  {
    id: "nasi-goreng-kampoeng",
    name: "Nasi Goreng Kampoeng Pedas",
    category: "food",
    portions: 5,
    targetPrice: 35000,
    ingredients: [
      { id: "1", name: "Beras Cianjur Pandanwangi", quantity: 1000, unit: "gram", price: 18000 },
      { id: "2", name: "Dada Ayam Fillet", quantity: 350, unit: "gram", price: 21000 },
      { id: "3", name: "Telur Ayam Negeri", quantity: 7, unit: "pcs", price: 14000 },
      { id: "4", name: "Minyak Goreng Sawit", quantity: 150, unit: "ml", price: 3000 },
      { id: "5", name: "Bumbu Racik Tradisional (Cabai, Bawang)", quantity: 1, unit: "paket", price: 15000 }
    ]
  },
  {
    id: "croissant-almond",
    name: "Butter Croissant Almond Topping",
    category: "pastry",
    portions: 8,
    targetPrice: 28000,
    ingredients: [
      { id: "1", name: "Adonan Croissant Mentega (Frozen Dough)", quantity: 8, unit: "pcs", price: 72000 },
      { id: "2", name: "Almond Sliced (Topping)", quantity: 120, unit: "gram", price: 18000 },
      { id: "3", name: "Mentega Elle & Vire (Unsalted)", quantity: 100, unit: "gram", price: 24000 },
      { id: "4", name: "Sugar Powder", quantity: 50, unit: "gram", price: 2000 },
      { id: "5", name: "Dus Kemasan Kraft Premium", quantity: 8, unit: "pcs", price: 12000 }
    ]
  }
];
