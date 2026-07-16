import { useState, useEffect, FormEvent, MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  TrendingUp, 
  Trash2, 
  RefreshCw, 
  ArrowLeft, 
  ArrowRight,
  X, 
  TrendingDown, 
  Info,
  Check,           
  BookOpen,        
  Coffee,         
  Utensils,        
  Cake,            
  Plus,          
  AlertTriangle,   
  PlusCircle,     
  Sparkles        
} from "lucide-react";
import "./NewLanding.css";
import { DEMO_PRESETS } from "./presets";
import { Ingredient, Recipe, AiCostingAnalysis } from "./types";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"landing" | "playground">("landing");
  
  // Scroll to top of page when changing tabs/menus
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);
  
  // Applet scroll shadow
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Sandbox - Current recipe state
  const [recipeName, setRecipeName] = useState("Kopi Susu Gula Aren (Signature)");
  const [portions, setPortions] = useState(10);
  const [targetPrice, setTargetPrice] = useState(22000);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { id: "1", name: "Espresso Blend (Gayo/Toraja)", quantity: 180, unit: "gram", price: 45000 },
    { id: "2", name: "Fresh Milk (Pasteurised)", quantity: 1200, unit: "ml", price: 34000 },
    { id: "3", name: "Gula Aren Cair Organik", quantity: 200, unit: "ml", price: 12000 },
    { id: "4", name: "Paper Cup & Straw Custom", quantity: 10, unit: "pcs", price: 8500 },
    { id: "5", name: "Es Batu (Ice Tube)", quantity: 1000, unit: "gram", price: 3000 }
  ]);

  // Applied AI discounts (simulates swapping to cheaper alternatives suggested by AI)
  const [appliedDiscounts, setAppliedDiscounts] = useState<{ [key: string]: number }>({});

  // Waste logs state
  const [wasteLogs, setWasteLogs] = useState<{ id: string; name: string; cost: number; timestamp: string }[]>([
    { id: "w-1", name: "Fresh milk basi (1 Liter)", cost: 28000, timestamp: "Hari ini, 09:30" },
    { id: "w-2", name: "Espresso shot gosong / over-extracted", cost: 12000, timestamp: "Hari ini, 11:15" }
  ]);
  const [newWasteName, setNewWasteName] = useState("");
  const [newWasteCost, setNewWasteCost] = useState<number | "">("");

  // ROI Calculator inputs
  const [roiRevenue, setRoiRevenue] = useState(150000000);
  const [roiFoodCost, setRoiFoodCost] = useState(35);
  const [roiOutlets, setRoiOutlets] = useState(1);

  // AI Costing Analyst states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AiCostingAnalysis | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState("");

  const loadingSteps = [
    "Membaca komposisi bahan baku...",
    "Menganalisis margin porsi produk...",
    "Mencari alternatif supplier lokal termurah di Indonesia...",
    "Menyusun rekomendasi pencegahan waste...",
    "Merumuskan strategi promosi (marketing hook)..."
  ];

  // Helper load preset
  const loadPreset = (presetId: string) => {
    const p = DEMO_PRESETS.find(x => x.id === presetId);
    if (p) {
      setRecipeName(p.name);
      setPortions(p.portions);
      setTargetPrice(p.targetPrice);
      setIngredients(p.ingredients);
      setAppliedDiscounts({});
      setAnalysisResult(null);
      setAiError(null);
    }
  };

  // Saved custom menus from local storage
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>(() => {
    try {
      const stored = localStorage.getItem("barventis_saved_recipes");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  const saveRecipeToCollection = () => {
    const isExist = savedRecipes.some(r => r.name.toLowerCase() === recipeName.toLowerCase());
    const newRecipe: Recipe = {
      name: recipeName,
      portions,
      targetPrice,
      ingredients
    };
    let updated: Recipe[] = [];
    if (isExist) {
      updated = savedRecipes.map(r => r.name.toLowerCase() === recipeName.toLowerCase() ? newRecipe : r);
    } else {
      updated = [...savedRecipes, newRecipe];
    }
    setSavedRecipes(updated);
    localStorage.setItem("barventis_saved_recipes", JSON.stringify(updated));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const deleteSavedRecipe = (name: string, e: MouseEvent) => {
    e.stopPropagation();
    const updated = savedRecipes.filter(r => r.name !== name);
    setSavedRecipes(updated);
    localStorage.setItem("barventis_saved_recipes", JSON.stringify(updated));
  };

  const loadSavedRecipe = (recipe: Recipe) => {
    setRecipeName(recipe.name);
    setPortions(recipe.portions);
    setTargetPrice(recipe.targetPrice);
    setIngredients(recipe.ingredients);
    setAppliedDiscounts({});
    setAnalysisResult(null);
    setAiError(null);
  };

  // Helper adding/editing ingredients
  const addIngredient = () => {
    const newId = (ingredients.length + 1).toString() + "-" + Date.now();
    setIngredients([
      ...ingredients,
      { id: newId, name: "Bahan Baru", quantity: 100, unit: "gram", price: 10000 }
    ]);
  };

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter(ing => ing.id !== id));
    if (appliedDiscounts[id]) {
      const updated = { ...appliedDiscounts };
      delete updated[id];
      setAppliedDiscounts(updated);
    }
  };

  const updateIngredient = (id: string, field: keyof Ingredient, value: any) => {
    setIngredients(ingredients.map(ing => {
      if (ing.id === id) {
        return { ...ing, [field]: value };
      }
      return ing;
    }));
  };

  // Calculate live costing indicators
  const totalRecipeCost = ingredients.reduce((sum, ing) => {
    const discount = appliedDiscounts[ing.id] || 0; // percentage
    const originalPrice = Number(ing.price) || 0;
    const finalPrice = originalPrice * (1 - discount / 100);
    return sum + finalPrice;
  }, 0);

  // Total daily waste costs
  const totalWasteCost = wasteLogs.reduce((sum, log) => sum + log.cost, 0);

  // Portion HPP
  const portionHpp = portions > 0 ? Math.round(totalRecipeCost / portions) : 0;
  
  // Dynamic portion HPP adjusted for simulated waste distributed over 100 portions of sale
  const portionHppWithWaste = portionHpp + Math.round(totalWasteCost / 100);

  // Food cost %
  const foodCostPercent = targetPrice > 0 ? Math.round((portionHpp / targetPrice) * 100) : 0;
  const foodCostWithWastePercent = targetPrice > 0 ? Math.round((portionHppWithWaste / targetPrice) * 100) : 0;

  // Profit margins
  const profitMarginIdr = targetPrice - portionHpp;
  const profitMarginPercent = targetPrice > 0 ? Math.round((profitMarginIdr / targetPrice) * 100) : 0;

  // Food Cost Color classification
  const getFoodCostColorClass = (pct: number) => {
    if (pct <= 28) return { text: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-600 text-white", ring: "ring-emerald-500/20" };
    if (pct <= 38) return { text: "text-amber-600", bg: "bg-amber-50 border-amber-200", badge: "bg-amber-600 text-white", ring: "ring-amber-500/20" };
    return { text: "text-rose-600", bg: "bg-rose-50 border-rose-200", badge: "bg-rose-600 text-white", ring: "ring-rose-500/20" };
  };

  const currentCostTheme = getFoodCostColorClass(foodCostPercent);

  // Add a simulated waste leak
  const addWasteLog = (e: FormEvent) => {
    e.preventDefault();
    if (!newWasteName || !newWasteCost || Number(newWasteCost) <= 0) return;
    const log = {
      id: "w-" + Date.now(),
      name: newWasteName,
      cost: Number(newWasteCost),
      timestamp: "Baru saja"
    };
    setWasteLogs([log, ...wasteLogs]);
    setNewWasteName("");
    setNewWasteCost("");
  };

  // Run AI analysis
  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiError(null);
    setAnalysisResult(null);

    // Loop through steps to make the loading UI feel alive and interesting
    let currentStepIndex = 0;
    setLoadingStep(loadingSteps[0]);
    const interval = setInterval(() => {
      currentStepIndex++;
      if (currentStepIndex < loadingSteps.length) {
        setLoadingStep(loadingSteps[currentStepIndex]);
      }
    }, 1200);

    try {
      const response = await fetch("/api/ai/analyze-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeName,
          portionSize: portions,
          ingredients,
          targetSellingPrice: targetPrice
        })
      });

      clearInterval(interval);

      if (!response.ok) {
        throw new Error("Gagal menerima analisis resep dari server AI.");
      }

      const data = await response.json();
      setAnalysisResult(data);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Koneksi terputus saat menghubungi AI.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Switch presets inside the calculator
  const toggleDiscount = (ingName: string, ingId: string, percentage: number) => {
    if (appliedDiscounts[ingId]) {
      // Toggle off
      const updated = { ...appliedDiscounts };
      delete updated[ingId];
      setAppliedDiscounts(updated);
    } else {
      // Toggle on
      setAppliedDiscounts({
        ...appliedDiscounts,
        [ingId]: percentage
      });
    }
  };

  // ROI Calculations
  const calculatedSavings = Math.round((roiRevenue * (roiFoodCost / 100) * 0.045) * roiOutlets);
  const beforeProfit = Math.round(roiRevenue * (1 - roiFoodCost/100));
  const afterProfit = beforeProfit + calculatedSavings;

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#191C1E] font-sans antialiased overflow-x-hidden">
      
      {/* Header / Top Bar */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 h-16 flex justify-between items-center px-4 md:px-12 border-b border-[#bcc9c6]/20 ${scrolled ? "bg-white/95 backdrop-blur-md shadow-md" : "bg-[#FDFBF7]/85 backdrop-blur-md shadow-sm"}`}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab("landing")}>
          <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-serif font-black text-lg shadow-sm">
            B
          </div>
          <span className="text-xl font-serif font-extrabold text-primary tracking-tight">Barventis</span>
          <span className="hidden sm:inline bg-primary-light text-primary px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">Playground 2.0</span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <button 
            onClick={() => setActiveTab("landing")} 
            className={`text-sm font-semibold transition-colors duration-200 ${activeTab === "landing" ? "text-primary" : "text-[#515f74] hover:text-primary"}`}
          >
            Beranda Solusi
          </button>
          <button 
            onClick={() => {
              setActiveTab("playground");
            }} 
            className={`text-sm font-semibold transition-colors duration-200 ${activeTab === "playground" ? "text-primary" : "text-[#515f74] hover:text-primary"}`}
          >
            Kalkulator & AI Demo
          </button>
          <a href="#roi-calc" className="text-sm font-semibold text-[#515f74] hover:text-primary transition-colors">
            Hitung ROI Resto
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {activeTab === "landing" ? (
            <button 
              onClick={() => setActiveTab("playground")}
              className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-full text-xs font-bold tracking-wide shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span className="hidden sm:inline">Coba Demo Interaktif</span><span className="sm:hidden">Coba Demo</span>
            </button>
          ) : (
            <button 
              onClick={() => setActiveTab("landing")}
              className="bg-white border border-[#bcc9c6]/50 hover:bg-[#FAFAF8] text-[#515f74] px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pt-16">
        <AnimatePresence mode="wait">
          {activeTab === "landing" ? (
            <motion.div
              key="landing-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
            >
              
              {/* Hero Section */}
              <section className="relative px-6 md:px-12 pt-12 pb-24 overflow-hidden bg-[#FDFBF7]">
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary-light/40 rounded-full blur-3xl -z-10 translate-x-1/3 -translate-y-1/4"></div>
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#ffddb8]/30 rounded-full blur-3xl -z-10 -translate-x-1/3 translate-y-1/4"></div>
                
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                  <div className="lg:col-span-7 flex flex-col gap-6 text-left">
                    <div className="inline-flex items-center self-start gap-1 bg-white border border-[#bcc9c6]/30 px-3.5 py-1.5 rounded-full shadow-sm">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map((s) => (
                          <span key={s} className="material-symbols-outlined text-[14px] text-[#ffb95f]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        ))}
                      </div>
                      <span className="font-handwriting text-lg text-[#515f74] rotate-[-1deg] ml-1">
                        Dipercaya 200+ Pemilik Kafe & Restoran di Indonesia
                      </span>
                    </div>

                    <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-black text-[#191C1E] leading-tight tracking-tight">
                      Kembalikan <span className="text-primary italic font-semibold underline decoration-accent decoration-wavy decoration-3">Waktu & Ketenangan</span> Anda dalam Mengelola Restoran.
                    </h1>
                    
                    <p className="text-base md:text-lg text-[#515f74] leading-relaxed max-w-xl">
                      Barventis membantu Anda mengontrol HPP secara otomatis, meminimalkan sisa bahan baku (waste), dan mengidentifikasi kebocoran stok instan secara real-time. Fokuslah pada pelayanan pelanggan, biar kami yang menghitung angkanya.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 mt-4">
                      <button 
                        onClick={() => setActiveTab("playground")}
                        className="bg-primary hover:bg-primary-hover text-white h-14 px-8 rounded-full font-bold text-base shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
                      >
                        Buka AI Costing Simulator
                      </button>
                      <button 
                        onClick={() => {
                          const el = document.getElementById("features");
                          if (el) el.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="bg-transparent text-primary hover:bg-primary-light/30 border border-primary/20 h-14 px-8 rounded-full font-bold text-base flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                      >
                        Pelajari Fitur Kami
                      </button>
                    </div>

                    <div className="flex items-center gap-6 mt-6 pt-6 border-t border-[#bcc9c6]/20">
                      <div className="flex -space-x-3">
                        <img className="w-10 h-10 rounded-full border-2 border-white object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBLIvcEmjDduXvLFoJsMxAhGkxvsoWqzO69UZk1RoMt-8Qf2dRalDSP75aUWajt40udk6zpW4wRsOse-Rx861bdbrsVHEw9688GvKNiQbqpaYvNsbQQCHez6ntdGA4N8m7e0nXy0TsmpgoF2z8Gvltq2IQWcDPxXkJnmt_atgkxX2x-2DJoEycGdfLD7_8K5PKZ_k43rAynaVMqUjBsgzVG5Wd3_RcnGV3RnBVKNwbmZS7vdHznF3cSJw" alt="Rina" referrerPolicy="no-referrer" />
                        <img className="w-10 h-10 rounded-full border-2 border-white object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAy_kpGIGkSNRKypx2RFd2BBrurRSxpvzr2YUDKMDCQFfpjILkK5Zh-ffFLM3IuZ2kC_YbR0UgLLtrg_vWcs2W_75bL0JYVuSF5pZCeHCRpDckashsGptJBKzos451qer-pcWTtGr1hINO0C8OP0Mh4d3FZPSXpmFXL31Dzz7HAwJjP2BZmE7zE_RXn7NitF4MRGmOP1mIZEmNKxETi-4opSoTX1o7bprNjVB8ait9USz2LcgkVASV_9Q" alt="Budi" referrerPolicy="no-referrer" />
                        <div className="w-10 h-10 rounded-full border-2 border-white bg-accent text-primary font-bold text-xs flex items-center justify-center">
                          +200
                        </div>
                      </div>
                      <p className="text-xs text-[#515f74] font-medium leading-normal">
                        Rina (Kopi Kebon), Budi (Resto Sedap Malam) <br />
                        dan ratusan pengusaha F&B Indonesia lainnya telah bergabung.
                      </p>
                    </div>
                  </div>

                  {/* Collage-style Hero Image Section */}
                  <div className="lg:col-span-5 relative mt-8 lg:mt-0">
                    <div className="relative z-10 organic-shape-1 overflow-hidden shadow-2xl border-4 border-white transform rotate-2 transition-transform hover:rotate-0 duration-500 max-w-sm mx-auto">
                      <img 
                        className="w-full h-auto object-cover aspect-[4/5]" 
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuABtykWVJEIUKga4mgjvh_DEMKIMneSPgCxpuj1SeZfjfirLf_fbnP9144g2io_yHn1E9-NZZ4QISUbv6bM2UVXgyC0VuEprpHrs35rirbXzD6qw9DewinVlsaBp_8fXPThM0tMaN1EREVote707hN6MxKAHY1iUV9CC_bPEDWsBrY18W5anxj9Js-VWpC0eCsGw6BFTbnkGmUauqzXRINGChO5MtBNe4LkZGCFp5lMMDKgDDJkrhjb5A" 
                        alt="Restoran Dashboard Barventis" 
                        referrerPolicy="no-referrer" 
                      />
                    </div>
                    {/* Floating graphical cards */}
                    <div className="absolute top-10 left-0 md:-left-6 glass-card p-4 rounded-2xl shadow-xl z-20 flex flex-col gap-0.5 transform -rotate-3 border border-[#bcc9c6]/30">
                      <span className="text-[10px] text-[#515f74] uppercase tracking-wider font-bold">Kebocoran Bahan</span>
                      <span className="text-sm font-bold text-emerald-700">-37% Less Waste</span>
                    </div>

                    <div className="absolute bottom-8 right-0 md:-right-4 glass-card p-4 rounded-2xl shadow-xl z-20 flex flex-col gap-0.5 transform rotate-3 border border-[#bcc9c6]/30">
                      <span className="text-[10px] text-[#515f74] uppercase tracking-wider font-bold">Rekomendasi AI</span>
                      <span className="text-sm font-bold text-primary">Saran HPP Akurat</span>
                    </div>

                    {/* Background blob decorations */}
                    <div className="absolute -top-6 -right-6 w-32 h-32 bg-accent/40 rounded-full opacity-60 blur-md -z-10"></div>
                    <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-primary/20 rounded-full opacity-60 blur-md -z-10"></div>
                  </div>
                </div>
              </section>

              {/* Dynamic Stats Banner */}
              <section className="bg-[#FAFAF8] py-10 border-y border-[#bcc9c6]/20 relative">
                <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-wrap justify-center gap-8 md:gap-16">
                  <div className="flex flex-col items-center text-center">
                    <span className="text-3xl md:text-4xl font-serif font-black text-primary">Rp 2.4 Miliar+</span>
                    <span className="text-xs md:text-sm text-[#515f74] font-medium mt-1">Stok Bahan Baku Terlacak Aman</span>
                  </div>
                  <div className="w-px bg-[#bcc9c6]/30 self-stretch hidden md:block"></div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-3xl md:text-4xl font-serif font-black text-tertiary">37.2%</span>
                    <span className="text-xs md:text-sm text-[#515f74] font-medium mt-1">Rata-rata Penurunan Sisa Bahan Baku</span>
                  </div>
                  <div className="w-px bg-[#bcc9c6]/30 self-stretch hidden md:block"></div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-3xl md:text-4xl font-serif font-black text-emerald-600">A+ Profit Score</span>
                    <span className="text-xs md:text-sm text-[#515f74] font-medium mt-1">Kategori Kesehatan Keuangan Kafe</span>
                  </div>
                </div>
              </section>

              {/* Core Features Showcase */}
              <section id="features" className="px-6 md:px-12 py-24 bg-white">
                <div className="max-w-7xl mx-auto">
                  <div className="text-center max-w-xl mx-auto flex flex-col gap-3 mb-16">
                    <span className="font-handwriting text-2xl text-primary font-bold">Fitur Kemitraan</span>
                    <h2 className="font-serif text-3xl md:text-4xl font-black text-[#191C1E] tracking-tight">
                      Didesain khusus untuk Pebisnis F&B, bukan untuk robot spreadsheet.
                    </h2>
                    <p className="text-[#515f74] text-sm md:text-base">
                      Kami memotong semua kerumitan akuntansi manual. Temukan kontrol penuh atas laba bersih kotor menu Anda dengan 3 alat utama ini.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Feature 1 */}
                    <div className="p-8 rounded-[2rem] bg-[#FAFAF8] border border-[#bcc9c6]/20 hover:shadow-xl hover:border-primary/20 transition-all duration-300 flex flex-col gap-5 group">
                      <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform relative">
                        <span className="material-symbols-outlined text-primary text-[28px]">analytics</span>
                        <div className="absolute -right-1 -bottom-1 w-5 h-5 bg-[#ffddb8] rounded-full opacity-70 -z-10"></div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-xl font-serif font-bold text-[#191C1E]">Dashboard HPP Otomatis</h3>
                        <p className="text-sm text-[#515f74] leading-relaxed">
                          Tidak perlu lagi menghitung HPP manual setiap kali harga bahan baku di pasar naik. Setiap struk pembelian terhubung langsung dengan resep menu aktif.
                        </p>
                      </div>
                      <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover transition-colors">
                        Buka simulasi dashboard
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Feature 2 */}
                    <div className="p-8 rounded-[2rem] bg-[#FAFAF8] border border-[#bcc9c6]/20 hover:shadow-xl hover:border-primary/20 transition-all duration-300 flex flex-col gap-5 group">
                      <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform relative">
                        <span className="material-symbols-outlined text-primary text-[28px]">inventory</span>
                        <div className="absolute -left-1 -bottom-1 w-5 h-5 bg-[#ffddb8] rounded-full opacity-70 -z-10"></div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-xl font-serif font-bold text-[#191C1E]">Sistem Audit Opname Cepat</h3>
                        <p className="text-sm text-[#515f74] leading-relaxed">
                          Stok opname bahan yang biasanya menguras waktu berjam-jam, sekarang bisa selesai dalam 15 menit sambil ngopi. Lacak selisih stok riil dan teori langsung.
                        </p>
                      </div>
                      <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover transition-colors">
                        Coba log penyusutan
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Feature 3 */}
                    <div className="p-8 rounded-[2rem] bg-[#FAFAF8] border border-[#bcc9c6]/20 hover:shadow-xl hover:border-primary/20 transition-all duration-300 flex flex-col gap-5 group">
                      <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform relative">
                        <span className="material-symbols-outlined text-primary text-[28px]">psychology</span>
                        <div className="absolute right-2 top-2 md:-right-1 md:-top-1 w-5 h-5 bg-primary-light rounded-full opacity-80 -z-10"></div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-xl font-serif font-bold text-[#191C1E]">Rekomendasi & Analis AI</h3>
                        <p className="text-sm text-[#515f74] leading-relaxed">
                          Asisten AI cerdas kami membaca resep Anda, membandingkannya dengan indeks harga nasional, lalu memberikan tips menekan biaya modal serta mencari substitusi bahan lokal.
                        </p>
                      </div>
                      <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover transition-colors">
                        Mulai konsultasi AI
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Before vs After Section */}
              <section className="bg-[#2A3130] text-[#eff1f3] py-24 px-6 md:px-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full blur-3xl -z-10 translate-x-1/2"></div>
                
                <div className="max-w-4xl mx-auto flex flex-col gap-12">
                  <div className="text-center">
                    <span className="font-handwriting text-2xl text-accent font-bold">Sebuah Cerita Perubahan</span>
                    <h2 className="font-serif text-3xl md:text-4xl font-black text-white mt-1 leading-tight">
                      Sebelum &amp; Sesudah Barventis
                    </h2>
                    <p className="text-sm text-gray-400 mt-2">
                      Bagaimana sistem kami mentransformasi operasional bisnis Anda menjadi jauh lebih sehat dan menyenangkan.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
                    {/* Before Card */}
                    <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] flex flex-col gap-6 relative">
                      <div className="absolute top-4 right-4 md:-top-4 md:-right-4 text-5xl opacity-15">🌧️</div>
                      <h3 className="text-xl font-serif font-bold text-white/95 border-b border-white/10 pb-3">Hari-hari yang Melelahkan</h3>
                      <ul className="flex flex-col gap-4">
                        <li className="flex gap-3 items-start">
                          <X className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-300 leading-relaxed">Tenggelam dalam lembaran spreadsheet yang membingungkan &amp; rawan salah formula.</span>
                        </li>
                        <li className="flex gap-3 items-start">
                          <X className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-300 leading-relaxed">Waktu bersama keluarga tersita hanya untuk menghitung ulang HPP secara manual setiap malam.</span>
                        </li>
                        <li className="flex gap-3 items-start">
                          <X className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-300 leading-relaxed">Bocor halus stok bahan baku (fresh milk, daging, sirup) sulit dilacak lokasinya.</span>
                        </li>
                      </ul>
                    </div>

                    {/* After Card */}
                    <div className="bg-primary/20 border border-primary/30 p-8 rounded-[2rem] flex flex-col gap-6 relative shadow-lg shadow-black/10">
                      <div className="absolute top-4 right-4 md:-top-4 md:-right-4 text-5xl opacity-20">☀️</div>
                      <h3 className="text-xl font-serif font-bold text-[#ffddb8] border-b border-primary/30 pb-3">Bernafas Lebih Lega</h3>
                      <ul className="flex flex-col gap-4">
                        <li className="flex gap-3 items-start">
                          <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <span className="text-sm text-white/90 leading-relaxed">Satu layar rapi, bersih, dan intuitif untuk semua info kesehatan profit finansial resto.</span>
                        </li>
                        <li className="flex gap-3 items-start">
                          <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <span className="text-sm text-white/90 leading-relaxed">Biaya HPP ter-update otomatis seiring perubahan harga supplier saat Anda beristirahat.</span>
                        </li>
                        <li className="flex gap-3 items-start">
                          <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <span className="text-sm text-white/90 leading-relaxed">Tenang &amp; percaya diri dengan audit stok opname harian yang presisi, cepat, dan akurat.</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="text-center pt-4">
                    <button 
                      onClick={() => setActiveTab("playground")}
                      className="bg-accent hover:bg-[#ffaa2b] text-primary h-14 px-8 rounded-full font-bold text-base shadow-xl shadow-accent/10 inline-flex items-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      Buktikan Sendiri di Demo Simulator
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </section>

              {/* Social Proof Gallery Section */}
              <section className="px-6 md:px-12 py-24 bg-[#FAFAF8] overflow-hidden">
                <div className="max-w-7xl mx-auto">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                    <div className="lg:col-span-5 flex flex-col gap-4 text-left">
                      <span className="font-handwriting text-2xl text-primary font-bold">Komunitas Kami</span>
                      <h2 className="font-serif text-3xl md:text-4xl font-black tracking-tight text-[#191C1E]">
                        Tumbuh Bersama Komunitas Barventis
                      </h2>
                      <p className="text-[#515f74] text-sm md:text-base leading-relaxed">
                        Bergabunglah dengan ratusan pemilik bisnis kuliner di Indonesia yang telah menemukan kembali ketenangan mengelola dapur mereka. Kami bukan sekadar software, kami adalah teman seperjuangan kafe Anda.
                      </p>
                      <div className="pt-2">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-white shadow-sm border border-[#bcc9c6]/20 rounded-2xl">
                            <span className="material-symbols-outlined text-primary text-[28px]">local_cafe</span>
                          </div>
                          <div>
                            <h4 className="font-serif font-bold text-sm text-[#191C1E]">Dukungan Komunitas F&amp;B</h4>
                            <p className="text-xs text-[#515f74]">Grup diskusi eksklusif resep, supplier, dan tips bisnis</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-7 relative">
                      <div className="organic-shape-2 overflow-hidden shadow-2xl border-4 border-white/80 relative z-10 max-w-lg mx-auto">
                        <img 
                          className="w-full h-80 object-cover object-center" 
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCFYwG3HIDJOSiE04Q5iJbKB3zRCXDoIVrOsxCw_8rtE_TImqhiQmtpeeaZURaVJrYye5apj3dkwll9_D0BaqosjF8V8dGZNjhLXlPVRxZ6rSawG0GkwU0plH1YXtJfM6u1Oe0Ue7DDZ3wg2M72eBaR0qcl90jO83bHzd8ASiQTFn-gGrtYLMTzSwIuRYNPUysmZ9IwDoFpq1pUC_Kdsl7DBIj2xhWHs3ako00H9GEztd597QxwVZRlZQ" 
                          alt="Komunitas Dapur Restoran" 
                          referrerPolicy="no-referrer" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                      </div>
                      <div className="absolute right-0 md:-right-4 top-1/2 text-5xl opacity-25 animate-pulse">✨</div>
                      <div className="absolute left-2 md:left-6 bottom-4 text-4xl opacity-25">🌿</div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Chat-Style Testimonials */}
              <section className="px-6 md:px-12 py-24 bg-white border-t border-[#bcc9c6]/20">
                <div className="max-w-4xl mx-auto">
                  <div className="text-center flex flex-col gap-3 mb-16">
                    <span className="font-handwriting text-2xl text-primary font-bold">Kata Sahabat Barventis</span>
                    <h2 className="font-serif text-3xl md:text-4xl font-black tracking-tight text-[#191C1E]">
                      Cerita Asli dari Balik Meja Bar &amp; Kasir
                    </h2>
                  </div>

                  <div className="flex flex-col gap-10">
                    {/* Testimonial 1 */}
                    <div className="flex flex-col items-start gap-2 max-w-xl pr-6">
                      <div className="flex items-end gap-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-primary/20 shadow-md">
                          <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBLIvcEmjDduXvLFoJsMxAhGkxvsoWqzO69UZk1RoMt-8Qf2dRalDSP75aUWajt40udk6zpW4wRsOse-Rx861bdbrsVHEw9688GvKNiQbqpaYvNsbQQCHez6ntdGA4N8m7e0nXy0TsmpgoF2z8Gvltq2IQWcDPxXkJnmt_atgkxX2x-2DJoEycGdfLD7_8K5PKZ_k43rAynaVMqUjBsgzVG5Wd3_RcnGV3RnBVKNwbmZS7vdHznF3cSJw" alt="Rina Sari" referrerPolicy="no-referrer" />
                        </div>
                        <div className="bg-[#FAFAF8] p-5 rounded-2xl rounded-bl-none shadow-sm border border-[#bcc9c6]/20 text-sm md:text-base text-[#191C1E] relative">
                          <p className="italic leading-relaxed">
                            "Sumpah, sejak pakai Barventis, waste bahan baku susu dan sirup di kafe saya turun drastis. Dulu cuma tebak-tebak buah manggis pas stok opname, sekarang tidurnya tenang banget karena semua kecatat presisi datanya. 🙏✨"
                          </p>
                        </div>
                      </div>
                      <div className="ml-15 pl-1 text-xs text-[#515f74] font-bold">
                        Rina Sari <span className="font-normal text-gray-400">• Owner Kopi Kebon, Bandung</span>
                      </div>
                    </div>

                    {/* Testimonial 2 */}
                    <div className="flex flex-col items-end gap-2 max-w-xl ml-auto pl-6">
                      <div className="flex items-end gap-3 flex-row-reverse">
                        <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-primary/20 shadow-md">
                          <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAy_kpGIGkSNRKypx2RFd2BBrurRSxpvzr2YUDKMDCQFfpjILkK5Zh-ffFLM3IuZ2kC_YbR0UgLLtrg_vWcs2W_75bL0JYVuSF5pZCeHCRpDckashsGptJBKzos451qer-pcWTtGr1hINO0C8OP0Mh4d3FZPSXpmFXL31Dzz7HAwJjP2BZmE7zE_RXn7NitF4MRGmOP1mIZEmNKxETi-4opSoTX1o7bprNjVB8ait9USz2LcgkVASV_9Q" alt="Budi" referrerPolicy="no-referrer" />
                        </div>
                        <div className="bg-primary/5 p-5 rounded-2xl rounded-br-none shadow-sm border border-primary/10 text-sm md:text-base text-[#191C1E] relative">
                          <p className="italic leading-relaxed">
                            "Integrasi ke POS-nya luar biasa mulus. Stok resep terpotong rapi otomatis seiring struk keluar. Stok opname mingguan yang biasanya bikin pusing berjam-jam, sekarang sambil ngopi 10 menit beres. Terima kasih banyak Barventis!"
                          </p>
                        </div>
                      </div>
                      <div className="mr-15 pr-1 text-xs text-[#515f74] font-bold">
                        Budi Harsono <span className="font-normal text-gray-400">• Owner Resto Sedap Malam, Surabaya</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Dynamic ROI Savings Calculator */}
              <section id="roi-calc" className="px-6 md:px-12 py-24 bg-[#FDFBF7]">
                <div className="max-w-4xl mx-auto">
                  <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl border border-[#bcc9c6]/30 flex flex-col gap-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-primary-light/40 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>
                    
                    <div className="text-center">
                      <span className="font-handwriting text-2xl text-tertiary font-bold">Mari Berhitung Sejenak</span>
                      <h2 className="font-serif text-3xl font-black text-primary mt-1">
                        Berapa Rupiah yang Bisa Anda Selamatkan?
                      </h2>
                      <p className="text-xs text-[#515f74] mt-2 max-w-md mx-auto">
                        Gunakan simulator finansial di bawah untuk melihat perkiraan peningkatan laba bersih operasional kafe Anda setelah optimasi limbah 4.5% oleh Barventis.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#515f74]">Rata-rata Omzet Bulanan (Rp)</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">Rp</span>
                          <input 
                            type="number" 
                            value={roiRevenue}
                            onChange={(e) => setRoiRevenue(Number(e.target.value) || 0)}
                            className="w-full h-12 pl-10 pr-4 bg-[#FAFAF8] border border-[#bcc9c6]/40 rounded-xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-sm font-semibold"
                          />
                        </div>
                        <span className="text-[10px] text-gray-400">Total penjualan kotor Anda</span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#515f74]">Food Cost Saat Ini (%)</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            min="1" 
                            max="100"
                            value={roiFoodCost}
                            onChange={(e) => setRoiFoodCost(Number(e.target.value) || 0)}
                            className="w-full h-12 px-4 bg-[#FAFAF8] border border-[#bcc9c6]/40 rounded-xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-sm font-semibold"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">%</span>
                        </div>
                        <span className="text-[10px] text-gray-400">Persentase modal bahan baku saat ini</span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-[#515f74]">Jumlah Cabang Aktif</label>
                        <input 
                          type="number" 
                          min="1"
                          value={roiOutlets}
                          onChange={(e) => setRoiOutlets(Number(e.target.value) || 1)}
                          className="w-full h-12 px-4 bg-[#FAFAF8] border border-[#bcc9c6]/40 rounded-xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-sm font-semibold"
                        />
                        <span className="text-[10px] text-gray-400">Jumlah outlet fisik aktif</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                      <div className="bg-[#FAFAF8] border border-[#bcc9c6]/30 p-6 rounded-2xl flex flex-col justify-between">
                        <span className="text-xs font-bold text-[#515f74]">ESTIMASI LABA KOTOR SEBELUMNYA</span>
                        <div className="mt-2">
                          <span className="text-lg text-gray-400 font-medium">Rp</span>
                          <span className="text-2xl font-serif font-black text-gray-600 ml-1">{(beforeProfit * roiOutlets).toLocaleString("id-ID")}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1">Berdasarkan total biaya food cost {roiFoodCost}%</span>
                      </div>

                      <div className="bg-primary/5 border-2 border-primary/20 p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute right-2 top-2 bg-primary text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Barventis Efek
                        </div>
                        <span className="text-xs font-bold text-primary">POTENSI LABA SETELAH OPTIMALISASI</span>
                        <div className="mt-2">
                          <span className="text-lg text-primary font-bold">Rp</span>
                          <span className="text-3xl font-serif font-black text-primary ml-1">{(afterProfit * roiOutlets).toLocaleString("id-ID")}</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-primary/10 flex items-center justify-between text-xs font-bold text-emerald-700">
                          <span>Tambahan Laba Bersih:</span>
                          <span>+ Rp {calculatedSavings.toLocaleString("id-ID")} / bln</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Pricing Table Section */}
              <section className="px-6 md:px-12 py-24 bg-[#FAFAF8] border-t border-[#bcc9c6]/20">
                <div className="max-w-5xl mx-auto">
                  <div className="text-center flex flex-col gap-3 mb-16">
                    <span className="font-handwriting text-2xl text-tertiary font-bold">Pilih Kemitraan Terbaik</span>
                    <h2 className="font-serif text-3xl md:text-4xl font-black text-[#191C1E] tracking-tight">
                      Sesuai dengan Skala Usaha Kuliner Anda
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto items-stretch">
                    {/* Tier 1 */}
                    <div className="bg-white p-8 rounded-[2rem] border border-[#bcc9c6]/20 shadow-sm flex flex-col gap-6">
                      <div>
                        <h3 className="font-serif text-2xl font-bold text-[#191C1E]">Langkah Awal</h3>
                        <p className="text-xs text-[#515f74] mt-1">Sempurna untuk merintis usaha kuliner mandiri.</p>
                      </div>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="font-serif text-4xl font-extrabold text-primary">Gratis Selamanya</span>
                      </div>
                      <ul className="flex flex-col gap-3.5 border-t border-gray-100 pt-6 mt-2">
                        <li className="flex gap-3 text-xs md:text-sm items-center text-[#515f74]">
                          <span className="text-primary font-bold shrink-0 font-mono">✓</span>
                          <span>1 Cabang Utama Terdaftar</span>
                        </li>
                        <li className="flex gap-3 text-xs md:text-sm items-center text-[#515f74]">
                          <span className="text-primary font-bold shrink-0 font-mono">✓</span>
                          <span>Catatan Opname Stok Dasar</span>
                        </li>
                        <li className="flex gap-3 text-xs md:text-sm items-center text-[#515f74]">
                          <span className="text-primary font-bold shrink-0 font-mono">✓</span>
                          <span>Maksimum 10 Resep Menu Aktif</span>
                        </li>
                        <li className="flex gap-3 text-xs md:text-sm items-center text-[#515f74]">
                          <span className="text-primary font-bold shrink-0 font-mono">✓</span>
                          <span>Hubungkan ke 1 POS Terintegrasi</span>
                        </li>
                      </ul>
                      <button 
                        onClick={() => setActiveTab("playground")}
                        className="w-full py-3.5 mt-auto border-2 border-primary/20 text-primary hover:bg-primary-light/50 font-bold rounded-xl transition-colors cursor-pointer text-sm text-center"
                      >
                        Mulai Dengan Paket Gratis
                      </button>
                    </div>

                    {/* Tier 2 */}
                    <div className="bg-primary p-8 rounded-[2.2rem] shadow-2xl shadow-primary/25 flex flex-col gap-6 relative transform scale-[1.03] border-2 border-accent">
                      <div className="absolute -top-4 right-6 bg-accent text-primary px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-md transform rotate-2">
                        Paling Banyak Dipilih
                      </div>
                      <div className="text-white">
                        <h3 className="font-serif text-2xl font-bold">Paket Tumbuh Bersama</h3>
                        <p className="text-xs text-white/80 mt-1">Untuk bisnis kuliner yang sedang berkembang mekar.</p>
                      </div>
                      <div className="flex items-baseline gap-1 mt-2 text-white">
                        <span className="text-base font-medium">Rp</span>
                        <span className="font-serif text-4xl font-extrabold text-accent">299K</span>
                        <span className="text-xs text-white/80 ml-1">/ bulan</span>
                      </div>
                      <ul className="flex flex-col gap-3.5 border-t border-white/20 pt-6 mt-2 text-white">
                        <li className="flex gap-3 text-xs md:text-sm items-center">
                          <span className="text-accent font-bold shrink-0 font-mono">✓</span>
                          <span>Kelola Nyaman hingga 3 Cabang</span>
                        </li>
                        <li className="flex gap-3 text-xs md:text-sm items-center">
                          <span className="text-accent font-bold shrink-0 font-mono">✓</span>
                          <span>Catatan HPP &amp; Buku Resep Tanpa Batas</span>
                        </li>
                        <li className="flex gap-3 text-xs md:text-sm items-center">
                          <span className="text-accent font-bold shrink-0 font-mono">✓</span>
                          <span>Analis HPP AI Assistant Tanpa Batas</span>
                        </li>
                        <li className="flex gap-3 text-xs md:text-sm items-center">
                          <span className="text-accent font-bold shrink-0 font-mono">✓</span>
                          <span>Dukungan tim support ramah via WhatsApp</span>
                        </li>
                      </ul>
                      <button 
                        onClick={() => setActiveTab("playground")}
                        className="w-full py-4 mt-auto bg-white text-primary font-bold rounded-xl shadow-lg hover:bg-cream transition-colors cursor-pointer text-sm text-center"
                      >
                        Coba Gratis Selama 14 Hari
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Dynamic Final CTA */}
              <section className="px-6 md:px-12 py-24 text-center flex flex-col gap-8 bg-[#FDFBF7] relative">
                <div className="max-w-xl mx-auto flex flex-col gap-4 relative z-10">
                  <h2 className="font-serif text-3xl md:text-4xl font-black text-[#191C1E] tracking-tight">
                    Mari Melangkah Lebih Ringan Hari Ini.
                  </h2>
                  <p className="text-[#515f74] text-sm md:text-base">
                    Biarkan tim dan kecerdasan sistem kami mengurus kerumitan angka HPP Anda, agar Anda bisa kembali meracik resep terbaik dan membuat pelanggan tersenyum gembira.
                  </p>
                </div>

                <div className="relative max-w-[320px] mx-auto w-full z-10">
                  <button 
                    onClick={() => setActiveTab("playground")}
                    className="w-full bg-primary hover:bg-primary-hover text-white h-16 rounded-full font-bold text-lg shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    Mulai Perjalanan Anda
                  </button>
                  
                  {/* Decorative Hand-drawn Arrow representation */}
                  <div className="absolute -right-16 -bottom-12 opacity-45 hidden md:block">
                    <svg className="transform -rotate-12" fill="none" height="60" viewBox="0 0 100 100" width="60" xmlns="http://www.w3.org/2000/svg">
                      <path className="text-tertiary" d="M10 90 Q 50 10, 90 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3"></path>
                      <path className="text-tertiary" d="M75 15 L 90 20 L 80 35" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3"></path>
                    </svg>
                  </div>
                </div>
                <span className="text-xs text-[#515f74] font-semibold">Tak Perlu Kartu Kredit • Akses Demo Bebas Kapan Saja</span>
              </section>

            </motion.div>
          ) : (
            // INTERACTIVE PLAYGROUND / DEMO DASHBOARD
            <motion.div
              key="playground-page"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto px-4 md:px-12 py-10"
              id="demo-section"
            >
              
              {/* Back Navigation Bar & Live Pulse */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#bcc9c6]/30 pb-6 mb-8">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setActiveTab("landing")}
                    className="p-2 rounded-full hover:bg-gray-100 border border-gray-200 text-[#515f74] transition-colors"
                    title="Kembali ke Beranda"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h1 className="font-serif text-2xl font-black text-[#191C1E]">
                      Barventis Sandbox Playground
                    </h1>
                    <p className="text-xs text-[#515f74]">
                      Simulasikan menu, resep, pencatatan limbah dapur, dan konsultasikan HPP Anda dengan AI.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start md:self-center bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-2xl">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs text-emerald-800 font-bold">
                    Sandbox Mode Connected
                  </span>
                </div>
              </div>

              {/* Playground Bento Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Left Side: Recipe Editor & Preset Loader (Grid: 7) */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                  
                  {/* Preset Selector */}
                  <div className="bg-white p-6 rounded-[2rem] border border-[#bcc9c6]/30 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-primary font-bold">
                      <BookOpen className="w-5 h-5" />
                      <h2 className="text-sm font-bold uppercase tracking-wider">Muat Menu Preset Cepat</h2>
                    </div>
                    
                    <div className="flex flex-wrap gap-2.5">
                      {DEMO_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => loadPreset(preset.id)}
                          className={`px-4 py-2.5 rounded-full text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer ${recipeName === preset.name ? "bg-primary border-primary text-white shadow-md shadow-primary/10" : "bg-white border-[#bcc9c6]/40 text-[#515f74] hover:bg-gray-50"}`}
                        >
                          {preset.category === "coffee" && <Coffee className="w-3.5 h-3.5" />}
                          {preset.category === "food" && <Utensils className="w-3.5 h-3.5" />}
                          {preset.category === "pastry" && <Cake className="w-3.5 h-3.5" />}
                          {preset.name}
                        </button>
                      ))}
                    </div>

                    {savedRecipes.length > 0 && (
                      <div className="flex flex-col gap-3 pt-3 border-t border-gray-100 mt-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#515f74]">
                          <span className="material-symbols-outlined text-primary text-[18px]">bookmark</span>
                          <span>Menu Kustom Anda ({savedRecipes.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {savedRecipes.map((recipe, idx) => (
                            <div
                              key={idx}
                              onClick={() => loadSavedRecipe(recipe)}
                              className={`px-3.5 py-2 rounded-full text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer ${recipeName === recipe.name ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/10" : "bg-white border-[#bcc9c6]/40 text-[#515f74] hover:bg-emerald-50/50"}`}
                            >
                              <span className="material-symbols-outlined text-[14px]">local_cafe</span>
                              <span className="truncate max-w-[120px]">{recipe.name}</span>
                              <button
                                onClick={(e) => deleteSavedRecipe(recipe.name, e)}
                                className="p-0.5 rounded-full hover:bg-rose-100 text-[#515f74] hover:text-rose-600 transition-colors ml-1"
                                title="Hapus dari koleksi"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Main Recipe Info */}
                  <div className="bg-white p-6 rounded-[2rem] border border-[#bcc9c6]/30 shadow-sm flex flex-col gap-5">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div className="flex items-center gap-2 font-bold text-[#191C1E]">
                        <span className="material-symbols-outlined text-primary text-[22px]">restaurant_menu</span>
                        <h2 className="text-base">Informasi Menu &amp; Porsi</h2>
                      </div>
                      <button
                        onClick={saveRecipeToCollection}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm ${saveSuccess ? "bg-emerald-600 text-white animate-pulse" : "bg-primary/10 hover:bg-primary/15 text-primary"}`}
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {saveSuccess ? "check_circle" : "bookmark_add"}
                        </span>
                        <span>{saveSuccess ? "Tersimpan! ✓" : "Simpan Menu"}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-6 flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#515f74]">Nama Resep Menu</label>
                        <input
                          type="text"
                          value={recipeName}
                          onChange={(e) => setRecipeName(e.target.value)}
                          className="w-full h-11 px-3.5 bg-[#FAFAF8] border border-[#bcc9c6]/40 rounded-xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-sm font-semibold"
                        />
                      </div>

                      <div className="md:col-span-3 flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#515f74]">Hasil Porsi (Yield)</label>
                        <input
                          type="number"
                          min="1"
                          value={portions}
                          onChange={(e) => setPortions(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full h-11 px-3.5 bg-[#FAFAF8] border border-[#bcc9c6]/40 rounded-xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-sm font-semibold"
                        />
                      </div>

                      <div className="md:col-span-3 flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#515f74]">Harga Jual / Porsi</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">Rp</span>
                          <input
                            type="number"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value) || 0))}
                            className="w-full h-11 pl-8 pr-3 bg-[#FAFAF8] border border-[#bcc9c6]/40 rounded-xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-sm font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ingredients Table list */}
                  <div className="bg-white p-6 rounded-[2rem] border border-[#bcc9c6]/30 shadow-sm flex flex-col gap-5">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div className="flex items-center gap-2 font-bold text-[#191C1E]">
                        <span className="material-symbols-outlined text-primary text-[22px]">kitchen</span>
                        <h2 className="text-base">Komposisi Bahan Baku ({ingredients.length})</h2>
                      </div>
                      <button
                        onClick={addIngredient}
                        className="bg-primary/10 hover:bg-primary/15 text-primary px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Tambah Bahan
                      </button>
                    </div>

                    <div className="flex flex-col gap-3">
                      {ingredients.map((ing) => {
                        const hasDiscount = appliedDiscounts[ing.id] !== undefined;
                        const savingsAmount = hasDiscount ? Math.round(ing.price * (appliedDiscounts[ing.id] / 100)) : 0;
                        return (
                          <div 
                            key={ing.id} 
                            className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row gap-3 md:items-center ${hasDiscount ? "bg-emerald-50/50 border-emerald-200" : "bg-[#FAFAF8] border-[#bcc9c6]/20"}`}
                          >
                            <div className="flex-1 min-w-[140px] flex flex-col gap-1">
                              <input
                                type="text"
                                value={ing.name}
                                onChange={(e) => updateIngredient(ing.id, "name", e.target.value)}
                                className="bg-transparent border-b border-transparent focus:border-primary/30 outline-none text-sm font-bold text-[#191C1E] py-0.5"
                                placeholder="Nama bahan baku"
                              />
                              <div className="flex items-center gap-2 text-xs text-[#515f74]">
                                <span>Kuantitas:</span>
                                <input
                                  type="number"
                                  value={ing.quantity}
                                  onChange={(e) => updateIngredient(ing.id, "quantity", Number(e.target.value) || 0)}
                                  className="w-12 bg-transparent border-b border-transparent focus:border-primary/30 outline-none text-center font-semibold"
                                />
                                <input
                                  type="text"
                                  value={ing.unit}
                                  onChange={(e) => updateIngredient(ing.id, "unit", e.target.value)}
                                  className="w-12 bg-transparent border-b border-transparent focus:border-primary/30 outline-none text-left"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between md:justify-end gap-4">
                              <div className="flex flex-col text-right">
                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Total Harga</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-gray-400">Rp</span>
                                  <input
                                    type="number"
                                    value={ing.price}
                                    onChange={(e) => updateIngredient(ing.id, "price", Number(e.target.value) || 0)}
                                    className="w-20 text-sm font-bold text-right bg-transparent border-b border-transparent focus:border-primary/30 outline-none"
                                  />
                                </div>
                                {hasDiscount && (
                                  <span className="text-[10px] font-bold text-emerald-600">
                                    AI Hemat {appliedDiscounts[ing.id]}% (-Rp {savingsAmount.toLocaleString("id-ID")})
                                  </span>
                                )}
                              </div>

                              <button
                                onClick={() => removeIngredient(ing.id)}
                                className="p-2 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Hapus bahan baku"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-[#FDFBF7] p-4 rounded-2xl border border-dashed border-[#bcc9c6]/40 flex justify-between items-center text-sm font-bold">
                      <span className="text-[#515f74]">Total Pengeluaran Bahan Baku:</span>
                      <span className="text-primary text-base">
                        Rp {Math.round(totalRecipeCost).toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>

                  {/* Sandbox Waste Logs simulator */}
                  <div className="bg-white p-6 rounded-[2rem] border border-[#bcc9c6]/30 shadow-sm flex flex-col gap-5">
                    <div className="border-b border-gray-100 pb-4">
                      <div className="flex items-center gap-2 font-bold text-[#191C1E]">
                        <span className="material-symbols-outlined text-rose-500 text-[24px]">delete_sweep</span>
                        <h2 className="text-base">Lacak Kebocoran &amp; Limbah (Waste) Harian</h2>
                      </div>
                      <p className="text-xs text-[#515f74] mt-1">
                        Limbah dapur menaikkan HPP riil resto Anda. Tambahkan simulasi sisa bahan tumpah/basi di bawah untuk melihat pergeseran profitabilitas.
                      </p>
                    </div>

                    <form onSubmit={addWasteLog} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-6">
                        <input
                          type="text"
                          required
                          placeholder="Misal: Susu basi tumpah 1 botol"
                          value={newWasteName}
                          onChange={(e) => setNewWasteName(e.target.value)}
                          className="w-full h-10 px-3.5 bg-[#FAFAF8] border border-[#bcc9c6]/40 rounded-xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-xs font-semibold"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">Rp</span>
                          <input
                            type="number"
                            required
                            placeholder="Kerugian"
                            value={newWasteCost}
                            onChange={(e) => setNewWasteCost(e.target.value !== "" ? Number(e.target.value) : "")}
                            className="w-full h-10 pl-8 pr-3 bg-[#FAFAF8] border border-[#bcc9c6]/40 rounded-xl focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all text-xs font-semibold"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="md:col-span-3 h-10 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Catat Waste
                      </button>
                    </form>

                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                      {wasteLogs.map((log) => (
                        <div key={log.id} className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-rose-950">{log.name}</span>
                            <span className="text-[10px] text-rose-500/80 font-medium">{log.timestamp}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-rose-700">Rp {log.cost.toLocaleString("id-ID")}</span>
                            <button
                              onClick={() => setWasteLogs(wasteLogs.filter(x => x.id !== log.id))}
                              className="text-rose-400 hover:text-rose-700 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {wasteLogs.length === 0 && (
                        <div className="text-center py-6 text-xs text-gray-400 font-semibold italic border border-dashed border-gray-200 rounded-xl">
                          Belum ada catatan kebocoran bahan untuk hari ini. Bagus!
                        </div>
                      )}
                    </div>

                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 flex justify-between items-center text-xs font-bold text-rose-900">
                      <div className="flex items-center gap-1.5">
                        <TrendingDown className="w-4 h-4 text-rose-600" />
                        <span>Estimasi Total Waste Terakumulasi:</span>
                      </div>
                      <span>Rp {totalWasteCost.toLocaleString("id-ID")}</span>
                    </div>
                  </div>

                </div>

                {/* Right Side: Costing Gauges, AI Report and ROI saving tracker (Grid: 5) */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  
                  {/* Costing Gauge Meter */}
                  <div className="bg-white p-6 rounded-[2rem] border border-[#bcc9c6]/30 shadow-sm flex flex-col gap-5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#515f74] border-b border-gray-100 pb-3">
                      Dashboard Analisis Costing Riil
                    </h2>

                    {/* Circular Food Cost Indicator */}
                    <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-[#FAFAF8] border border-[#bcc9c6]/20 relative overflow-hidden">
                      <div className="relative w-36 h-36 flex items-center justify-center">
                        {/* Circle path bar SVG */}
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="72"
                            cy="72"
                            r="58"
                            className="stroke-[#bcc9c6]/20"
                            strokeWidth="10"
                            fill="transparent"
                          />
                          <circle
                            cx="72"
                            cy="72"
                            r="58"
                            className={`transition-all duration-500 ${foodCostPercent <= 28 ? "stroke-emerald-600" : foodCostPercent <= 38 ? "stroke-amber-500" : "stroke-rose-600"}`}
                            strokeWidth="10"
                            fill="transparent"
                            strokeDasharray={364.4}
                            strokeDashoffset={Math.max(0, 364.4 - (364.4 * Math.min(100, foodCostPercent)) / 100)}
                            strokeLinecap="round"
                          />
                        </svg>
                        
                        <div className="absolute flex flex-col items-center">
                          <span className="text-3xl font-serif font-black text-[#191C1E]">
                            {foodCostPercent}%
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                            Food Cost
                          </span>
                        </div>
                      </div>

                      {/* Health Label Badge */}
                      <span className={`px-4 py-1.5 rounded-full text-xs font-bold mt-4 shadow-sm border ${currentCostTheme.bg} ${currentCostTheme.text}`}>
                        {foodCostPercent <= 28 ? "Sangat Sehat (Ideal)" : foodCostPercent <= 38 ? "Waspada Kebocoran" : "Biaya Modal Terlalu Tinggi"}
                      </span>

                      {/* Waste adjustment overlay warning */}
                      {totalWasteCost > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-200/60 w-full text-[11px] text-[#515f74] flex justify-between items-center">
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                            HPP setelah limbah:
                          </span>
                          <span className="font-bold text-rose-600">
                            Rp {portionHppWithWaste.toLocaleString("id-ID")} ({foodCostWithWastePercent}%)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Numeric breakdown cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#FAFAF8] border border-[#bcc9c6]/20 p-4 rounded-2xl">
                        <span className="text-[10px] text-gray-400 font-bold block uppercase">HPP / PORSI</span>
                        <span className="text-base font-serif font-black text-[#191C1E] mt-1 block">
                          Rp {portionHpp.toLocaleString("id-ID")}
                        </span>
                      </div>
                      <div className="bg-[#FAFAF8] border border-[#bcc9c6]/20 p-4 rounded-2xl">
                        <span className="text-[10px] text-gray-400 font-bold block uppercase">LABA PER PORSI</span>
                        <span className={`text-base font-serif font-black mt-1 block ${profitMarginPercent >= 70 ? "text-emerald-700" : profitMarginPercent >= 55 ? "text-amber-700" : "text-rose-700"}`}>
                          Rp {profitMarginIdr.toLocaleString("id-ID")} ({profitMarginPercent}%)
                        </span>
                      </div>
                    </div>

                    {/* Ingredient Cost Distribution Breakdown */}
                    <div className="bg-[#FAFAF8] border border-[#bcc9c6]/20 p-5 rounded-2xl flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-gray-200/60 pb-2">
                        <span className="text-xs font-bold text-[#515f74] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-primary text-[18px]">analytics</span>
                          Proporsi Biaya Bahan Baku
                        </span>
                        <span className="text-[10px] text-gray-400 font-semibold">Kontribusi HPP</span>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        {ingredients.map((ing) => {
                          const discount = appliedDiscounts[ing.id] || 0;
                          const originalPrice = Number(ing.price) || 0;
                          const finalPrice = originalPrice * (1 - discount / 100);
                          const percentage = totalRecipeCost > 0 ? Math.round((finalPrice / totalRecipeCost) * 100) : 0;
                          
                          // Custom bar color based on percentage share
                          const barColor = percentage >= 40 
                            ? "bg-rose-500" 
                            : percentage >= 20 
                              ? "bg-amber-500" 
                              : "bg-emerald-500";
                              
                          return (
                            <div key={ing.id} className="flex flex-col gap-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-gray-800 truncate max-w-[180px]">
                                  {ing.name}
                                </span>
                                <div className="flex items-center gap-2 font-mono text-[11px]">
                                  <span className="text-gray-400">Rp {Math.round(finalPrice).toLocaleString("id-ID")}</span>
                                  <span className="font-bold text-gray-700">({percentage}%)</span>
                                </div>
                              </div>
                              <div className="w-full bg-gray-200/60 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${barColor} rounded-full transition-all duration-500`}
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                        {ingredients.length === 0 && (
                          <div className="text-center py-2 text-xs text-gray-400 italic">
                            Masukkan bahan baku untuk melihat kontribusi biaya.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Call AI action */}
                    <button
                      onClick={runAiAnalysis}
                      disabled={isAnalyzing}
                      className="w-full bg-primary hover:bg-primary-hover disabled:bg-primary/50 text-white h-13 rounded-xl font-bold text-sm shadow-lg shadow-primary/10 flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
                    >
                      {isAnalyzing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                          <span>Memanggil AI: {loadingStep}...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4.5 h-4.5 text-accent animate-pulse" />
                          <span>Konsultasikan Resep dengan AI</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Interactive Price Sensitivity Matrix */}
                  <div className="bg-white p-6 rounded-[2rem] border border-[#bcc9c6]/30 shadow-sm flex flex-col gap-4">
                    <div className="flex flex-col gap-1 border-b border-gray-100 pb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#515f74] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary text-[18px]">payments</span>
                        Matriks Sensitivitas Harga &amp; Margin
                      </h3>
                      <p className="text-[11px] text-[#515f74] leading-relaxed">
                        Klik pada baris harga di bawah untuk menerapkan harga jual tersebut ke resep Anda secara langsung.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      {[
                        { label: "Margin Tipis (HPP 45%)", factor: 0.45, badge: "Saran Cafe Pemula" },
                        { label: "Harga Standar (HPP 35%)", factor: 0.35, badge: "Rekomendasi Umum" },
                        { label: "Laba Premium (HPP 28%)", factor: 0.28, badge: "Sangat Sehat" },
                        { label: "Laba Maksimal (HPP 22%)", factor: 0.22, badge: "Resto Premium" }
                      ].map((tier, idx) => {
                        const calculatedPrice = portionHpp > 0 ? Math.round(portionHpp / tier.factor / 1000) * 1000 : 0;
                        const fcPercent = calculatedPrice > 0 ? Math.round((portionHpp / calculatedPrice) * 100) : 0;
                        const profitIdr = calculatedPrice - portionHpp;
                        const isCurrent = Math.abs(targetPrice - calculatedPrice) < 1500; // Close enough

                        return (
                          <button
                            key={idx}
                            disabled={calculatedPrice === 0}
                            onClick={() => {
                              if (calculatedPrice > 0) setTargetPrice(calculatedPrice);
                            }}
                            className={`p-3 rounded-xl border text-left transition-all flex justify-between items-center text-xs ${isCurrent ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20" : "bg-[#FAFAF8] border-gray-150 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"}`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-gray-800 flex items-center gap-1.5">
                                Rp {calculatedPrice.toLocaleString("id-ID")}
                                {isCurrent && (
                                  <span className="bg-primary text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">🎯 Aktif</span>
                                )}
                              </span>
                              <span className="text-[10px] text-gray-400 font-medium">{tier.label}</span>
                            </div>

                            <div className="flex flex-col items-end text-right">
                              <span className={`font-bold ${fcPercent <= 28 ? "text-emerald-600" : fcPercent <= 38 ? "text-amber-600" : "text-rose-600"}`}>
                                Food Cost: {fcPercent}%
                              </span>
                              <span className="text-[10px] text-gray-500 font-semibold">
                                Profit: +Rp {profitIdr.toLocaleString("id-ID")}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI Report Card */}
                  <AnimatePresence mode="wait">
                    {isAnalyzing && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-white p-8 rounded-[2rem] border border-dashed border-primary/40 shadow-sm text-center flex flex-col items-center gap-4 py-12"
                      >
                        <div className="relative w-16 h-16 flex items-center justify-center">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/10"></span>
                          <div className="w-12 h-12 bg-primary-light rounded-full flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-primary animate-spin" />
                          </div>
                        </div>
                        <div>
                          <h3 className="font-serif font-bold text-base text-primary">Barventis Costing AI Sedang Bekerja</h3>
                          <p className="text-xs text-[#515f74] mt-1.5 max-w-xs mx-auto leading-relaxed">
                            Mencari substitusi bahan baku lokal terbaik di database kuliner Indonesia untuk menekan HPP porsi Anda...
                          </p>
                        </div>
                        {/* Dynamic loading steps visual bar */}
                        <div className="w-full max-w-xs bg-gray-100 h-1.5 rounded-full overflow-hidden mt-2">
                          <div className="bg-primary h-full animate-pulse" style={{ width: "70%" }}></div>
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                          {loadingStep}
                        </span>
                      </motion.div>
                    )}

                    {aiError && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-5 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl flex flex-col gap-2 text-xs font-semibold"
                      >
                        <div className="flex items-center gap-2 font-bold">
                          <AlertTriangle className="w-4.5 h-4.5 text-rose-600" />
                          <span>Terjadi Kesalahan Analisis AI</span>
                        </div>
                        <p className="font-normal text-rose-950/80 leading-relaxed">{aiError}</p>
                        <button
                          onClick={runAiAnalysis}
                          className="mt-2 text-rose-700 underline font-bold hover:text-rose-900 flex items-center gap-1 self-start"
                        >
                          Coba Ulangi Hubungkan AI
                        </button>
                      </motion.div>
                    )}

                    {analysisResult && !isAnalyzing && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-6 rounded-[2.5rem] border-2 border-primary/20 shadow-xl flex flex-col gap-6 relative"
                      >
                        <div className="absolute -top-3 left-0 md:-left-3 bg-gradient-to-r from-primary to-emerald-600 text-white px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-md flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-accent" />
                          <span>Rekomendasi AI Aktif</span>
                        </div>

                        {/* Top Score & Summary */}
                        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mt-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Skor Profitabilitas</span>
                            <span className="text-sm font-serif font-bold text-[#191C1E]">Struktur Biaya Resep</span>
                          </div>
                          <div className="w-14 h-14 bg-gradient-to-br from-primary to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
                            <span className="text-xl font-black text-white font-mono">{analysisResult.profitabilityScore}</span>
                          </div>
                        </div>

                        <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#515f74] leading-relaxed relative">
                          <Info className="w-4 h-4 text-primary absolute right-3 top-3" />
                          <p className="pr-6">{analysisResult.analysisSummary}</p>
                        </div>

                        {/* Portion Target adjustment */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                            <span className="text-[9px] text-emerald-800 font-bold uppercase block tracking-wider">Saran Harga Jual</span>
                            <span className="text-sm font-bold text-emerald-950 block mt-0.5">
                              Rp {analysisResult.suggestedSellingPrice?.toLocaleString("id-ID")}
                            </span>
                          </div>
                          <div className="p-3 bg-primary-light/50 border border-primary-light rounded-xl">
                            <span className="text-[9px] text-primary font-bold uppercase block tracking-wider">Target Ideal Food Cost</span>
                            <span className="text-sm font-bold text-primary block mt-0.5">
                              {analysisResult.optimizedFoodCostPercent}%
                            </span>
                          </div>
                        </div>

                        {/* Alternative Substitutes Swapping Panel */}
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[#191C1E]">
                            <span className="material-symbols-outlined text-primary text-[18px]">swap_horizontal_circle</span>
                            <span>Substitusi Bahan Baku (Klik untuk Terapkan)</span>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            {analysisResult.alternatives?.map((alt, idx) => {
                              // Find matching ingredient in active list to check active swaps
                              const matchingIng = ingredients.find(i => i.name.toLowerCase().includes(alt.originalIngredient.toLowerCase().split(" ")[0]));
                              const isApplied = matchingIng ? appliedDiscounts[matchingIng.id] !== undefined : false;

                              return (
                                <button
                                  key={idx}
                                  disabled={!matchingIng}
                                  onClick={() => {
                                    if (matchingIng) {
                                      toggleDiscount(matchingIng.name, matchingIng.id, alt.costDifferencePercent);
                                    }
                                  }}
                                  className={`p-3.5 rounded-xl text-left border transition-all text-xs flex justify-between items-center ${!matchingIng ? "opacity-60 bg-gray-50 border-gray-100 cursor-not-allowed" : isApplied ? "bg-emerald-50 border-emerald-300 shadow-sm" : "bg-white border-[#bcc9c6]/40 hover:border-primary/40 cursor-pointer"}`}
                                >
                                  <div className="flex flex-col gap-0.5 pr-4 flex-1">
                                    <div className="flex items-center gap-1.5 font-bold text-gray-900">
                                      <span className="line-through text-gray-400">{alt.originalIngredient}</span>
                                      <span className="text-gray-400">→</span>
                                      <span className="text-primary">{alt.suggestedReplacement}</span>
                                    </div>
                                    <p className="text-[11px] text-[#515f74] font-normal leading-relaxed mt-1">
                                      {alt.reasoning}
                                    </p>
                                  </div>

                                  <div className="flex flex-col items-end shrink-0 pl-2">
                                    <span className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider mb-2">
                                      Hemat {alt.costDifferencePercent}%
                                    </span>
                                    {isApplied ? (
                                      <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
                                        <Check className="w-3 h-3 stroke-[3]" /> Terpasang
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-primary hover:underline">
                                        {matchingIng ? "Pasang swap" : "Bahan absen"}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Waste reduction bullets */}
                        <div className="flex flex-col gap-2 bg-[#FAFAF8] border border-gray-150 p-4 rounded-2xl text-xs text-[#515f74]">
                          <span className="font-bold text-[#191C1E] flex items-center gap-1">
                            <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
                            Langkah Cegah Waste Resep Ini:
                          </span>
                          <ul className="flex flex-col gap-2 mt-2 list-inside list-disc pl-1">
                            {analysisResult.wasteMitigationSteps?.map((step, sIdx) => (
                              <li key={sIdx} className="leading-relaxed">{step}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Marketing highlight Hook */}
                        <div className="bg-[#ffddb8]/20 border border-[#ffddb8] p-4 rounded-2xl flex gap-3.5">
                          <span className="material-symbols-outlined text-[#825100] text-[26px] shrink-0 mt-0.5">campaign</span>
                          <div className="flex flex-col gap-0.5 text-xs text-[#515f74]">
                            <span className="font-bold text-[#825100]">Ide Promosi Menu (Marketing Hook):</span>
                            <p className="italic leading-relaxed mt-1">"{analysisResult.marketingHook}"</p>
                          </div>
                        </div>

                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>

              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modern Compact Footer */}
      <footer className="mt-24 border-t border-[#bcc9c6]/20 bg-[#FAFAF8] py-12 px-6 md:px-12 rounded-t-[2.5rem]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[28px]">spa</span>
              <span className="font-serif text-lg font-extrabold text-primary tracking-tight">Barventis</span>
            </div>
            <p className="text-xs text-[#515f74] max-w-sm leading-relaxed">
              Dibuat dengan sepenuh hati untuk memajukan, menyederhanakan, dan meningkatkan profitabilitas ekosistem teman-teman pengusaha F&amp;B di seluruh Nusantara.
            </p>
          </div>

          <div className="flex flex-wrap gap-8 text-xs font-bold text-[#515f74]">
            <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("landing"); }} className="hover:text-primary transition-colors">Beranda Utama</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("playground"); }} className="hover:text-primary transition-colors">AI Sandbox Simulator</a>
            <a href="#roi-calc" className="hover:text-primary transition-colors">Estimasi Tabungan Resto</a>
            <a href="#" className="hover:text-primary transition-colors">Kebijakan Privasi</a>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-[#bcc9c6]/10 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] text-gray-400 font-medium">
          <span>© 2026 Barventis. Semua hal baik dilindungi undang-undang.</span>
          <div className="flex gap-4">
            <span className="material-symbols-outlined text-[16px] text-primary">favorite</span>
            <span className="material-symbols-outlined text-[16px] text-tertiary">local_cafe</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
