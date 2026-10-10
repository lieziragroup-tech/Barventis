import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

interface AnalyzeRecipePayload {
  recipeName: string;
  portionSize: number;
  ingredients: Ingredient[];
  targetSellingPrice: number;
}

function generateAlgorithmicAnalysis(payload: AnalyzeRecipePayload) {
  const { recipeName, portionSize, ingredients, targetSellingPrice } = payload;
  const portions = portionSize > 0 ? portionSize : 1;
  const totalCost = (ingredients || []).reduce((sum, ing) => sum + (Number(ing.price) || 0), 0);
  const portionHpp = Math.round(totalCost / portions);
  const targetPrice = targetSellingPrice > 0 ? targetSellingPrice : Math.round(portionHpp * 3.3);
  const rawCostPct = targetPrice > 0 ? Math.round((portionHpp / targetPrice) * 100) : 30;

  // Build smart alternatives based on ingredients
  const alternatives = (ingredients || []).slice(0, 3).map((ing, idx) => {
    const nameLower = (ing.name || "").toLowerCase();
    if (nameLower.includes("espresso") || nameLower.includes("kopi") || nameLower.includes("coffee") || nameLower.includes("bean")) {
      return {
        originalIngredient: ing.name,
        suggestedReplacement: "Commercial Blend 70:30 (Direct Roaster Lokal Jawa/Sumatra)",
        costDifferencePercent: 18,
        reasoning: "Menghemat biaya logistik distributor dengan mengambil langsung batch roasting mingguan, profil crema & body tetap tebal."
      };
    }
    if (nameLower.includes("milk") || nameLower.includes("susu")) {
      return {
        originalIngredient: ing.name,
        suggestedReplacement: "Pasteurized Fresh Milk Kemasan Bulk 5L (Koperasi Susu Lokal)",
        costDifferencePercent: 15,
        reasoning: "Mengurangi sampah kemasan 1L retail dan mendapatkan harga grosir industri tanpa menurunkan kualitas microfoam."
      };
    }
    if (nameLower.includes("gula") || nameLower.includes("sugar") || nameLower.includes("syrup") || nameLower.includes("sirup")) {
      return {
        originalIngredient: ing.name,
        suggestedReplacement: "In-house Concentrated Simple/Aren Syrup (Batch Cooking)",
        costDifferencePercent: 25,
        reasoning: "Memasak larutan konsentrat sendiri di central kitchen menghemat hingga 25% dibanding membeli botolan siap pakai."
      };
    }
    if (nameLower.includes("cup") || nameLower.includes("sedotan") || nameLower.includes("straw") || nameLower.includes("packaging")) {
      return {
        originalIngredient: ing.name,
        suggestedReplacement: "Pemesanan Karton Pabrik Polos + Stempel Tinta Kedelai",
        costDifferencePercent: 20,
        reasoning: "Biaya unit cup custom print sablon pabrikan curah lebih murah 20% dibanding sablon manual skala kecil."
      };
    }
    const defaultSavings = 12 + (idx * 3);
    return {
      originalIngredient: ing.name,
      suggestedReplacement: `${ing.name} Kemasan Grosir Industri / Grade B2B`,
      costDifferencePercent: defaultSavings,
      reasoning: "Pengadaan skala kartonan melalui supplier bahan baku F&B terverifikasi memangkas biaya per gram."
    };
  });

  const averageSaving = alternatives.length > 0
    ? alternatives.reduce((s, a) => s + a.costDifferencePercent, 0) / alternatives.length
    : 15;
  const optimizedPortionHpp = Math.round(portionHpp * (1 - (averageSaving * 0.5) / 100));
  const optimizedFoodCostPercent = targetPrice > 0 ? Math.round((optimizedPortionHpp / targetPrice) * 100) : 26;
  const suggestedSellingPrice = Math.max(targetPrice, Math.round((portionHpp / 0.28) / 1000) * 1000);

  let score = "A";
  if (rawCostPct <= 27) score = "A+";
  else if (rawCostPct <= 34) score = "A";
  else if (rawCostPct <= 40) score = "B";
  else score = "C";

  return {
    profitabilityScore: score,
    analysisSummary: `Menu "${recipeName}" memiliki HPP awal Rp ${portionHpp.toLocaleString('id-ID')} (${rawCostPct}% food cost). Dengan optimasi efisiensi rantai pasok dan pemangkasan waste preparasi, food cost dapat ditekan menjadi ${optimizedFoodCostPercent}% dengan margin kotor yang sangat sehat.`,
    estimatedPortionCost: portionHpp,
    optimizedFoodCostPercent,
    suggestedSellingPrice,
    alternatives,
    wasteMitigationSteps: [
      "Terapkan kalibrasi timbangan digital 0.1g untuk dosis bahan espresso/ekstrak agar tidak terjadi over-dosing.",
      "Gunakan milk pitcher sesuai ukuran cup untuk menghindari sisa susu steam yang terbuang sia-sia.",
      "Pastikan rotasi stok menggunakan sistem FIFO ketat dan cantumkan tanggal buka kemasan pada setiap bahan."
    ],
    marketingHook: `Nikmati cita rasa premium ${recipeName} dengan perpaduan racikan otentik yang pas di kantong!`
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(compression());

  app.use(helmet({
    contentSecurityPolicy: false, // CSP might break Vite dev server HMR if not configured correctly
    frameguard: false, // Allow iframe rendering in AI Studio preview
  }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: "Too many requests, please try again later." }
  });

  app.use("/api", apiLimiter);

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // AI Recipe Costing Analysis endpoint
  app.post("/api/ai/analyze-recipe", async (req, res) => {
    try {
      const { recipeName, portionSize, ingredients, targetSellingPrice } = req.body || {};
      if (!recipeName || !Array.isArray(ingredients)) {
        res.status(400).json({ error: "Data resep dan bahan baku tidak lengkap." });
        return;
      }

      const payload: AnalyzeRecipePayload = {
        recipeName: String(recipeName),
        portionSize: Number(portionSize) || 1,
        ingredients: ingredients || [],
        targetSellingPrice: Number(targetSellingPrice) || 0
      };

      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const prompt = `Anda adalah konsultan F&B Cost Controller profesional di Indonesia.
Analisis resep berikut:
- Nama Resep: ${payload.recipeName}
- Jumlah Porsi: ${payload.portionSize}
- Target Harga Jual: Rp ${payload.targetSellingPrice}
- Bahan Baku:
${payload.ingredients.map(i => `  * ${i.name}: ${i.quantity} ${i.unit} (biaya: Rp ${i.price})`).join("\n")}

Keluarkan JSON dengan schema berikut (tanpa markdown backticks, murni valid JSON):
{
  "profitabilityScore": "A+" | "A" | "B" | "C",
  "analysisSummary": "Ringkasan ringkas 2-3 kalimat tentang efisiensi cost dan potensi margin dalam Bahasa Indonesia profesional",
  "estimatedPortionCost": number (integer estimasi HPP per porsi dalam rupiah),
  "optimizedFoodCostPercent": number (integer persentase food cost teroptimasi, misal 26),
  "suggestedSellingPrice": number (integer rekomendasi harga jual optimal rupiah),
  "alternatives": [
    {
      "originalIngredient": "nama bahan asli",
      "suggestedReplacement": "nama alternatif bahan / supplier lokal",
      "costDifferencePercent": number (angka persen penghematan misal 15),
      "reasoning": "alasan efisiensi tanpa merusak cita rasa"
    }
  ],
  "wasteMitigationSteps": [
    "SOP langkah 1",
    "SOP langkah 2",
    "SOP langkah 3"
  ],
  "marketingHook": "Tagline promosi menarik untuk menu ini"
}`;

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
            }
          });

          const responseText = response.text?.trim();
          if (responseText) {
            const parsed = JSON.parse(responseText);
            if (parsed.profitabilityScore && parsed.analysisSummary) {
              res.json(parsed);
              return;
            }
          }
        } catch (geminiErr) {
          console.warn("Gemini API call failed, falling back to algorithmic calculation:", geminiErr);
        }
      }

      // Fallback algorithmic analysis engine
      const analysis = generateAlgorithmicAnalysis(payload);
      res.json(analysis);
    } catch (err: any) {
      console.error("Error analyzing recipe:", err);
      res.status(500).json({ error: err.message || "Gagal memproses analisis resep." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Explicit SPA fallback for development (needed for hard reloads)
    app.get('*all', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) return next();
      try {
        const fs = await import('fs');
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      maxAge: '1y',
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    app.get('*all', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
