export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number; // Cost of this quantity
}

export interface Recipe {
  name: string;
  portions: number;
  ingredients: Ingredient[];
  targetPrice: number;
}

export interface AiAlternative {
  originalIngredient: string;
  suggestedReplacement: string;
  costDifferencePercent: number;
  reasoning: string;
}

export interface AiCostingAnalysis {
  profitabilityScore: string;
  analysisSummary: string;
  estimatedPortionCost: number;
  optimizedFoodCostPercent: number;
  suggestedSellingPrice: number;
  alternatives: AiAlternative[];
  wasteMitigationSteps: string[];
  marketingHook: string;
}

export interface DemoMenuPreset {
  id: string;
  name: string;
  category: "coffee" | "food" | "pastry";
  portions: number;
  targetPrice: number;
  ingredients: Ingredient[];
}
