/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, FormEvent, useEffect, useRef } from "react";
import { Plus, Trash2, LayoutGrid, User, Settings, Pencil, Check, X, CheckCircle2, Clock, ChevronRight, ArrowLeft, Calendar, Box, Minus, Play, History, TrendingUp, TrendingDown, BarChart3, PieChart, Sparkles, TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon, ListTodo, ShoppingBasket, Camera, Scan, Loader2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI, Type } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is not configured. Please ensure it is set in the environment.");
  }
  return new GoogleGenAI({ apiKey });
};

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface PurchaseHistory {
  id: string;
  date: string;
  storeName: string;
  items: ShoppingItem[];
  total: number;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  isUsing: boolean;
}

interface TodoItem {
  id: string;
  name: string;
  completed: boolean;
}

type Tab = "current" | "history" | "inventory" | "summary" | "todo";

const normalizeString = (str: string) => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s]/g, "")         // Remove punctuation
    .replace(/\s+/g, " ")            // Normalize spaces
    .trim();
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("current");
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [storeName, setStoreName] = useState("");

  // History states
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<PurchaseHistory | null>(null);

  // Inventory states
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // States for Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editHistoryItemId, setEditHistoryItemId] = useState<string | null>(null);
  const [editHistoryName, setEditHistoryName] = useState("");
  const [editHistoryQuantity, setEditHistoryQuantity] = useState("");
  const [editHistoryPrice, setEditHistoryPrice] = useState("");
  const [isAddingToHistory, setIsAddingToHistory] = useState(false);
  const [newHistItemName, setNewHistItemName] = useState("");
  const [newHistItemQty, setNewHistItemQty] = useState("");
  const [newHistItemPrice, setNewHistItemPrice] = useState("");
  const [isEditingStoreName, setIsEditingStoreName] = useState(false);
  const [editStoreName, setEditStoreName] = useState("");

  // Comparison states
  const [compareId1, setCompareId1] = useState<string>("");
  const [compareId2, setCompareId2] = useState<string>("");

  // Todo List states (What's missing)
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [todoName, setTodoName] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Smart Add (Scanner) states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scannedResult, setScannedResult] = useState<{ suggestedName: string, prices: { label: string, value: number }[] } | null>(null);
  const [scannedName, setScannedName] = useState("");
  const [selectedScannedPrice, setSelectedScannedPrice] = useState<number | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedItems = localStorage.getItem("shopping_list_current");
    const savedHistory = localStorage.getItem("shopping_history");
    const savedInventory = localStorage.getItem("shopping_inventory");
    const savedTodo = localStorage.getItem("shopping_todo");
    
    if (savedItems) {
      try { setItems(JSON.parse(savedItems)); } catch (e) { console.error(e); }
    }
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }
    if (savedInventory) {
      try { setInventory(JSON.parse(savedInventory)); } catch (e) { console.error(e); }
    }
    if (savedTodo) {
      try { setTodoItems(JSON.parse(savedTodo)); } catch (e) { console.error(e); }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever items change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("shopping_list_current", JSON.stringify(items));
      localStorage.setItem("shopping_inventory", JSON.stringify(inventory));
      localStorage.setItem("shopping_todo", JSON.stringify(todoItems));
    }
  }, [items, inventory, todoItems, isLoaded]);

  const totalGeneral = useMemo(() => {
    return items.reduce((acc, item) => acc + item.quantity * item.price, 0);
  }, [items]);

  // --- Summary Calculations ---
  const summaryData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentMonthTotal = history
      .filter(h => {
        const d = new Date(h.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, h) => acc + h.total, 0);

    const lastMonthTotal = history
      .filter(h => {
        const d = new Date(h.date);
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
      })
      .reduce((acc, h) => acc + h.total, 0);

    const diffValue = currentMonthTotal - lastMonthTotal;
    const diffPercent = lastMonthTotal > 0 ? (diffValue / lastMonthTotal) * 100 : 0;

    // Price Increases Analysis
    const itemPricesHistory: Record<string, number[]> = {};
    history.forEach(h => {
      h.items.forEach(i => {
        const name = i.name.toLowerCase();
        if (!itemPricesHistory[name]) itemPricesHistory[name] = [];
        itemPricesHistory[name].unshift(i.price); // Newest prices at index 0 via order of history processing (assuming history is [newest, ..., oldest])
      });
    });

    // Actually history is [newest, ..., oldest], so history.forEach processes newest first.
    // Let's re-organize to get a clean newest vs previous comparison
    const priceIncreases = Object.entries(itemPricesHistory)
      .map(([name, prices]) => {
        if (prices.length < 2) return null;
        const current = prices[0];
        const previous = prices[1];
        const inc = ((current - previous) / previous) * 100;
        return { name, inc, current, previous };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.inc > 0)
      .sort((a, b) => b.inc - a.inc)
      .slice(0, 3);

    // Cost Impact Analysis
    const itemCostTotal: Record<string, number> = {};
    history.forEach(h => {
      h.items.forEach(i => {
        const name = i.name.toLowerCase();
        itemCostTotal[name] = (itemCostTotal[name] || 0) + (i.quantity * i.price);
      });
    });

    const costImpact = Object.entries(itemCostTotal)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return {
      currentMonthTotal,
      lastMonthTotal,
      diffValue,
      diffPercent,
      priceIncreases,
      costImpact
    };
  }, [history]);

  const comparisonResult = useMemo(() => {
    if (!compareId1 || !compareId2) return null;
    const h1 = history.find(h => h.id === compareId1);
    const h2 = history.find(h => h.id === compareId2);
    if (!h1 || !h2) return null;

    const commonItems: { name: string, price1: number, price2: number, diff: number }[] = [];
    
    h1.items.forEach(i1 => {
      const norm1 = normalizeString(i1.name);
      const match = h2.items.find(i2 => normalizeString(i2.name) === norm1);
      if (match) {
        commonItems.push({
          name: i1.name,
          price1: i1.price,
          price2: match.price,
          diff: match.price - i1.price
        });
      }
    });

    return {
      store1: h1.storeName,
      store2: h2.storeName,
      items: commonItems,
      totalDiff: h2.total - h1.total
    };
  }, [compareId1, compareId2, history]);

  const handleAddItem = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !quantity || !price) return;

    const newItem: ShoppingItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      quantity: parseFloat(quantity),
      price: parseFloat(price),
    };

    setItems((prev) => [newItem, ...prev]);

    // Update Todo items if match found (ignoring case and punctuation)
    const normalizedNewName = normalizeString(name);
    setTodoItems(prev => prev.map(todo => {
      if (!todo.completed && normalizeString(todo.name) === normalizedNewName) {
        return { ...todo, completed: true };
      }
      return todo;
    }));

    setName("");
    setQuantity("");
    setPrice("");
  };

  // --- Scanner Logic ---
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const initCamera = async () => {
      if (isScannerOpen) {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Seu navegador não suporta acesso à câmera.");
          }

          let stream: MediaStream;
          
          // Tenta primeiro com as configurações ideais (câmera traseira)
          try {
            const constraints: MediaStreamConstraints = { 
              video: { 
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              } 
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
          } catch (firstErr) {
            console.warn("Falha ao abrir câmera com restrições ideais, tentando genérico:", firstErr);
            // Fallback: Tentativa ultra-genérica (qualquer câmera)
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }

          currentStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Safari mobile precisa do play() explícito às vezes mesmo com autoPlay
            videoRef.current.play().catch(e => console.error("Erro ao dar play no vídeo:", e));
          }
        } catch (err) {
          console.error("Erro total câmera:", err);
          let userMsg = "Não foi possível acessar a câmera.";
          
          if (err instanceof Error) {
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
              userMsg = "Permissão da câmera negada. Verifique as configurações do seu navegador.";
            } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
              userMsg = "Nenhuma câmera encontrada no seu dispositivo.";
            } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
              userMsg = "A câmera já está sendo usada por outro aplicativo.";
            }
          }
          
          setScannerError(userMsg + " Tente recarregar a página ou usar em um navegador moderno.");
        }
      }
    };

    initCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isScannerOpen]);

  const startScanner = async () => {
    setIsScannerOpen(true);
    setScannerError(null);
    setScannedResult(null);
    setScannedName("");
    setSelectedScannedPrice(null);
  };

  const stopScanner = async () => {
    setIsScannerOpen(false);
    setIsAnalyzing(false);
    setScannedResult(null);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setScannerError("Aguardando câmera...");
      return;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Focus Area
    const cropWidth = canvas.width * 0.9;
    const cropHeight = canvas.height * 0.8;
    const cropX = (canvas.width - cropWidth) / 2;
    const cropY = (canvas.height - cropHeight) / 2;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext('2d');
    if (cropCtx) {
      cropCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    }

    const imageData = cropCanvas.toDataURL("image/jpeg", 0.95);

    setIsAnalyzing(true);
    setScannerError(null);

    try {
      const aiInstance = getAI();
      const base64Image = imageData.split(',')[1];
      
      const response = await aiInstance.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Image } },
            { text: "Analyze this supermarket shelf label. Identify the product name and ALL prices found. Distinguish between 'Varejo' (Retail) and 'Atacado' (Wholesale/Bulk) if possible. Return ONLY a JSON object: { \"productName\": \"...\", \"prices\": [ { \"label\": \"Varejo\", \"value\": 0.0 }, { \"label\": \"Atacado\", \"value\": 0.0 } ] }. No markdown formatting." }
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              productName: { type: Type.STRING },
              prices: { 
                type: Type.ARRAY,
                items: { 
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.NUMBER }
                  }
                }
              }
            }
          }
        }
      });

      const resultString = response.text || "{}";
      const result = JSON.parse(resultString.replace(/```json/g, '').replace(/```/g, '').trim());
      
      if (!result.productName && (!result.prices || result.prices.length === 0)) {
        throw new Error("Não foi possível detectar o produto ou preço. Tente aproximar mais a câmera ou evitar reflexos.");
      }

      const rawPrices = (result.prices || []);
      const validPrices = rawPrices.length > 0 
        ? rawPrices.filter((p: any) => typeof p.value === 'number' && p.value > 0)
        : [];
      
      const name = (result.productName || "Item Identificado").trim();

      setScannedName(name);
      setScannedResult({
        suggestedName: name,
        prices: validPrices.length > 0 ? validPrices : [{ label: "Preço", value: 0 }]
      });
      setSelectedScannedPrice(validPrices.length > 0 ? validPrices[0].value : 0);
    } catch (err) {
      console.error("Analysis Error:", err);
      setScannerError(err instanceof Error ? err.message : "Erro ao analisar imagem.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addItemFromScanner = () => {
    if (!scannedResult || !selectedScannedPrice) return;

    const finalName = scannedName.trim() || scannedResult.suggestedName || "Item Escaneado";
    const newItem: ShoppingItem = {
      id: crypto.randomUUID(),
      name: finalName,
      quantity: 1,
      price: selectedScannedPrice,
    };

    setItems((prev) => [newItem, ...prev]);

    // Cross out from Todo matching name
    const normalizedNewName = normalizeString(finalName);
    setTodoItems(prev => prev.map(todo => {
      if (!todo.completed && normalizeString(todo.name) === normalizedNewName) {
        return { ...todo, completed: true };
      }
      return todo;
    }));

    stopScanner();
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const startEditing = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditQuantity(item.quantity.toString());
    setEditPrice(item.price.toString());
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEdit = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, quantity: parseFloat(editQuantity) || 0, price: parseFloat(editPrice) || 0 }
          : item
      )
    );
    setEditingId(null);
  };

  const finishPurchase = () => {
    if (items.length === 0) return;

    const newPurchase: PurchaseHistory = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      storeName: storeName.trim() || `Compra em ${new Date().toLocaleDateString('pt-BR')}`,
      items: [...items],
      total: totalGeneral,
    };

    const newHistory = [newPurchase, ...history];
    setHistory(newHistory);
    localStorage.setItem("shopping_history", JSON.stringify(newHistory));

    // Update Inventory
    setInventory((prev) => {
      const updatedInventory = [...prev];
      items.forEach((shopItem) => {
        const existingIdx = updatedInventory.findIndex(
          (invItem) => invItem.name.toLowerCase() === shopItem.name.toLowerCase()
        );
        if (existingIdx > -1) {
          updatedInventory[existingIdx].quantity += shopItem.quantity;
        } else {
          updatedInventory.push({
            id: crypto.randomUUID(),
            name: shopItem.name,
            quantity: shopItem.quantity,
            isUsing: false,
          });
        }
      });
      return updatedInventory;
    });

    setItems([]);
    setStoreName("");
    localStorage.removeItem("shopping_list_current");
    alert("Compra finalizada! Mercado registrado.");
  };

  // --- History Edit Actions ---
  const saveHistoryEdit = (purchaseId: string, itemId: string) => {
    setHistory(prev => {
      const updated = prev.map(purchase => {
        if (purchase.id === purchaseId) {
          const updatedItems = purchase.items.map(item => {
            if (item.id === itemId) {
              return {
                ...item,
                name: editHistoryName,
                quantity: parseFloat(editHistoryQuantity) || 0,
                price: parseFloat(editHistoryPrice) || 0
              };
            }
            return item;
          });
          const newTotal = updatedItems.reduce((acc, i) => acc + i.quantity * i.price, 0);
          const updatedPurchase = { ...purchase, items: updatedItems, total: newTotal };
          setSelectedHistory(updatedPurchase);
          return updatedPurchase;
        }
        return purchase;
      });
      localStorage.setItem("shopping_history", JSON.stringify(updated));
      return updated;
    });
    setEditHistoryItemId(null);
  };

  const removeHistoryItem = (purchaseId: string, itemId: string) => {
    if (!confirm("Remover este item do histórico?")) return;
    setHistory(prev => {
      const updated = prev.map(purchase => {
        if (purchase.id === purchaseId) {
          const updatedItems = purchase.items.filter(i => i.id !== itemId);
          const newTotal = updatedItems.reduce((acc, i) => acc + i.quantity * i.price, 0);
          const updatedPurchase = { ...purchase, items: updatedItems, total: newTotal };
          setSelectedHistory(updatedPurchase);
          return updatedPurchase;
        }
        return purchase;
      });
      localStorage.setItem("shopping_history", JSON.stringify(updated));
      return updated;
    });
  };

  const addItemToHistory = (purchaseId: string) => {
    if (!newHistItemName || !newHistItemQty || !newHistItemPrice) return;
    const newItem: ShoppingItem = {
      id: crypto.randomUUID(),
      name: newHistItemName,
      quantity: parseFloat(newHistItemQty) || 0,
      price: parseFloat(newHistItemPrice) || 0
    };

    setHistory(prev => {
      const updated = prev.map(purchase => {
        if (purchase.id === purchaseId) {
          const updatedItems = [...purchase.items, newItem];
          const newTotal = updatedItems.reduce((acc, i) => acc + i.quantity * i.price, 0);
          const updatedPurchase = { ...purchase, items: updatedItems, total: newTotal };
          setSelectedHistory(updatedPurchase);
          return updatedPurchase;
        }
        return purchase;
      });
      localStorage.setItem("shopping_history", JSON.stringify(updated));
      return updated;
    });

    setNewHistItemName("");
    setNewHistItemQty("");
    setNewHistItemPrice("");
    setIsAddingToHistory(false);
  };

  const saveHistoryStoreName = (purchaseId: string) => {
    setHistory(prev => {
      const updated = prev.map(purchase => {
        if (purchase.id === purchaseId) {
          const updatedPurchase = { ...purchase, storeName: editStoreName.trim() };
          setSelectedHistory(updatedPurchase);
          return updatedPurchase;
        }
        return purchase;
      });
      localStorage.setItem("shopping_history", JSON.stringify(updated));
      return updated;
    });
    setIsEditingStoreName(false);
  };

  const deletePurchase = (purchaseId: string) => {
    if (!confirm("Excluir esta compra permanentemente?")) return;
    const newHistory = history.filter(h => h.id !== purchaseId);
    setHistory(newHistory);
    localStorage.setItem("shopping_history", JSON.stringify(newHistory));
    setSelectedHistory(null);
  };

  // Inventory Actions
  const updateInventoryQty = (id: string, delta: number) => {
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = Math.max(0, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const toggleInvUsing = (id: string) => {
    setInventory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isUsing: !item.isUsing } : item))
    );
  };

  const removeFromInventory = (id: string) => {
    setInventory((prev) => prev.filter((item) => item.id !== id));
  };

  // Todo List Actions
  const handleAddTodo = (e: FormEvent) => {
    e.preventDefault();
    if (!todoName.trim()) return;
    const newItem: TodoItem = {
      id: crypto.randomUUID(),
      name: todoName.trim(),
      completed: false,
    };
    setTodoItems(prev => [newItem, ...prev]);
    setTodoName("");
  };

  const toggleTodo = (id: string) => {
    setTodoItems(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  const removeTodo = (id: string) => {
    setTodoItems(prev => prev.filter(item => item.id !== id));
  };

  const clearCompletedTodos = () => {
    setTodoItems(prev => prev.filter(item => !item.completed));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getLastPrice = (name: string) => {
    if (!history.length) return null;
    // Percorre o histórico da mais recente para a mais antiga
    for (const purchase of history) {
      const match = purchase.items.find(i => i.name.toLowerCase() === name.trim().toLowerCase());
      if (match) return match.price;
    }
    return null;
  };

  const PriceComparison = ({ currentPrice, itemName }: { currentPrice: number, itemName: string }) => {
    const lastPrice = getLastPrice(itemName);
    if (lastPrice === null) return null;

    const diff = ((currentPrice - lastPrice) / lastPrice) * 100;
    const isIncreased = diff > 0;
    const isDecreased = diff < 0;
    const isEqual = diff === 0;

    return (
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
          Ant: {formatCurrency(lastPrice)}
        </span>
        <div className={`flex items-center gap-0.5 text-[9px] font-black ${isIncreased ? 'text-red-500' : isDecreased ? 'text-emerald-500' : 'text-slate-400'}`}>
          <span>{isIncreased ? '🔺' : isDecreased ? '🔻' : '⚖️'}</span>
          <span>{Math.abs(diff).toFixed(1)}%</span>
        </div>
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center font-sans p-4">
      {/* App Frame (Mobile Simulation) */}
      <div className="w-[380px] h-[720px] bg-white rounded-[48px] shadow-2xl relative overflow-hidden border-[8px] border-slate-800 flex flex-col">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7.5 bg-slate-800 rounded-b-2xl z-20" />

        {/* Dynamic Content based on Tab */}
        <div className="flex-1 overflow-hidden flex flex-col">
          
          <AnimatePresence mode="wait">
            {activeTab === "current" ? (
              <motion.div 
                key="current"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {/* Header Section */}
                <header className="pt-12 px-6 pb-4 bg-gradient-to-b from-slate-50 to-white shrink-0">
                  <div className="flex justify-between items-end mb-4">
                    <h1 className="text-slate-400 text-[10px] font-bold tracking-widest uppercase">Minha Compra</h1>
                    <span className="text-[10px] text-slate-400 font-medium tracking-tighter">LISTA ATUAL</span>
                  </div>

                  <motion.div 
                    layout
                    className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 flex flex-col items-center justify-center shadow-sm"
                  >
                    <span className="text-emerald-600 text-[10px] font-bold uppercase tracking-widest mb-1">Total da Lista</span>
                    <motion.h2 
                      key={totalGeneral}
                      initial={{ scale: 0.9, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-4xl font-black text-emerald-700 tabular-nums"
                    >
                      {formatCurrency(totalGeneral)}
                    </motion.h2>
                  </motion.div>

                  <div className="mt-4 px-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1">🏠 Nome do Mercado</label>
                    <input
                      type="text"
                      placeholder="Ex: Atacadão, Assaí..."
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300 shadow-sm"
                    />
                  </div>
                </header>

                {/* Input Control Section */}
                <div className="px-6 mb-2 shrink-0">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <form onSubmit={handleAddItem}>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="col-span-2">
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1 text-center">Item</label>
                          <input
                            type="text"
                            placeholder="Ex: Maçã"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300 text-center"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1 text-center">Qtd</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="1"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300 text-center"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 ml-1 text-center">Preço</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0,00"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300 text-center"
                            required
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex gap-2">
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-emerald-200/50 flex items-center justify-center gap-2"
                          >
                            <Plus className="w-5 h-5 stroke-[3]" /> Adicionar
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={startScanner}
                            className="flex-1 bg-slate-800 hover:bg-black text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-slate-200/50 flex items-center justify-center gap-2 text-[10px] uppercase tracking-tighter"
                          >
                            <Camera className="w-5 h-5" /> Escanear
                          </motion.button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>

                {/* List Section */}
                <div className="flex-1 px-6 overflow-hidden flex flex-col min-h-0">
                  <div className="flex justify-between items-center my-3 shrink-0">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Itens Adicionados ({items.length})
                    </h3>
                    {items.length > 0 && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={finishPurchase}
                        className="text-[10px] font-bold text-white bg-slate-800 px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-black transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Finalizar
                      </motion.button>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-3 pb-4 no-scrollbar">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {items.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="py-10 flex flex-col items-center justify-center text-slate-300 bg-slate-50/50 rounded-2xl border border-dashed border-slate-100"
                        >
                          <p className="text-xs font-medium">Lista Vazia</p>
                        </motion.div>
                      ) : (
                        items.map((item, index) => (
                          <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={`flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow group ${
                              index % 2 === 0 ? 'border-l-4 border-l-emerald-400' : ''
                            } ${editingId === item.id ? 'ring-2 ring-emerald-500/30' : ''}`}
                          >
                            <div className="flex flex-col min-w-0 pr-2 flex-1">
                              <span className="font-bold text-slate-800 truncate leading-tight mb-0.5">{item.name}</span>
                              {editingId === item.id ? (
                                <div className="flex items-center gap-2 mt-1">
                                  <input 
                                    type="number"
                                    value={editQuantity}
                                    onChange={(e) => setEditQuantity(e.target.value)}
                                    className="w-12 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-1 text-[10px] font-bold focus:outline-none"
                                  />
                                  <span className="text-[10px] text-slate-300">×</span>
                                  <input 
                                    type="number"
                                    value={editPrice}
                                    onChange={(e) => setEditPrice(e.target.value)}
                                    className="w-20 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-1 text-[10px] font-bold focus:outline-none"
                                  />
                                </div>
                              ) : (
                                <>
                                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                                    {item.quantity} un × {formatCurrency(item.price)}
                                  </span>
                                  <PriceComparison currentPrice={item.price} itemName={item.name} />
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right mr-1">
                                <span className="block font-black text-slate-900 text-sm">
                                  {editingId === item.id 
                                    ? formatCurrency((parseFloat(editQuantity) || 0) * (parseFloat(editPrice) || 0))
                                    : formatCurrency(item.quantity * item.price)
                                  }
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                {editingId === item.id ? (
                                  <>
                                    <button onClick={() => saveEdit(item.id)} className="p-1 text-emerald-600"><Check className="w-4 h-4 stroke-[3]" /></button>
                                    <button onClick={cancelEditing} className="p-1 text-slate-400"><X className="w-4 h-4 stroke-[3]" /></button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => startEditing(item)} className="p-1 text-slate-300 hover:text-emerald-500 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => removeItem(item.id)} className="p-1 text-slate-200 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === "history" ? (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {selectedHistory ? (
                  /* Detail view */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <header className="pt-12 px-6 pb-4 bg-slate-50 shrink-0 border-b border-slate-100">
                      <div className="flex justify-between items-start mb-4">
                        <button onClick={() => {
                          setSelectedHistory(null);
                          setIsAddingToHistory(false);
                          setEditHistoryItemId(null);
                          setIsEditingStoreName(false);
                        }} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors">
                          <ArrowLeft className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Voltar</span>
                        </button>
                        <button 
                          onClick={() => deletePurchase(selectedHistory.id)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {isEditingStoreName ? (
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            value={editStoreName}
                            onChange={(e) => setEditStoreName(e.target.value)}
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            autoFocus
                          />
                          <button onClick={() => saveHistoryStoreName(selectedHistory.id)} className="text-emerald-500"><Check className="w-4 h-4 stroke-[3]" /></button>
                          <button onClick={() => setIsEditingStoreName(false)} className="text-slate-400"><X className="w-4 h-4 stroke-[3]" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <h2 className="text-xl font-black text-slate-800 leading-tight capitalize">{selectedHistory.storeName}</h2>
                          <button 
                            onClick={() => {
                              setIsEditingStoreName(true);
                              setEditStoreName(selectedHistory.storeName);
                            }}
                            className="p-1 text-slate-300 hover:text-emerald-500 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                        {formatDate(selectedHistory.date)}
                      </p>
                    </header>

                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 no-scrollbar">
                      <div className="flex justify-between items-center px-1">
                        <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Itens da Compra ({selectedHistory.items.length})</h3>
                        <button 
                          onClick={() => setIsAddingToHistory(!isAddingToHistory)}
                          className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-lg"
                        >
                          <Plus className="w-3 h-3" /> Adicionar
                        </button>
                      </div>

                      <AnimatePresence>
                        {isAddingToHistory && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-slate-50 border border-slate-100 rounded-2xl p-4 overflow-hidden"
                          >
                            <div className="grid grid-cols-4 gap-2 mb-3">
                              <input 
                                type="text"
                                placeholder="Item"
                                value={newHistItemName}
                                onChange={(e) => setNewHistItemName(e.target.value)}
                                className="col-span-4 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                              />
                              <input 
                                type="number"
                                placeholder="Qtd"
                                value={newHistItemQty}
                                onChange={(e) => setNewHistItemQty(e.target.value)}
                                className="col-span-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                              />
                              <input 
                                type="number"
                                placeholder="Preço"
                                value={newHistItemPrice}
                                onChange={(e) => setNewHistItemPrice(e.target.value)}
                                className="col-span-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => addItemToHistory(selectedHistory.id)}
                                className="flex-1 bg-emerald-500 text-white text-[10px] font-black uppercase py-2.5 rounded-xl"
                              >
                                Adicionar Item Esquecido
                              </button>
                              <button 
                                onClick={() => setIsAddingToHistory(false)}
                                className="px-4 bg-slate-200 text-slate-600 text-[10px] font-black uppercase py-2.5 rounded-xl"
                              >
                                Cancelar
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="space-y-3">
                        {selectedHistory.items.map((item, idx) => (
                          <div key={item.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex justify-between items-center shadow-sm group">
                            {editHistoryItemId === item.id ? (
                              <div className="flex-1 space-y-2">
                                <input 
                                  type="text"
                                  value={editHistoryName}
                                  onChange={(e) => setEditHistoryName(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                />
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number"
                                    value={editHistoryQuantity}
                                    onChange={(e) => setEditHistoryQuantity(e.target.value)}
                                    className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                  />
                                  <span className="text-[10px] text-slate-400">×</span>
                                  <input 
                                    type="number"
                                    value={editHistoryPrice}
                                    onChange={(e) => setEditHistoryPrice(e.target.value)}
                                    className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                  />
                                  <div className="flex-1" />
                                  <button onClick={() => saveHistoryEdit(selectedHistory.id, item.id)} className="p-1 text-emerald-600"><Check className="w-5 h-5 stroke-[3]" /></button>
                                  <button onClick={() => setEditHistoryItemId(null)} className="p-1 text-slate-400"><X className="w-5 h-5 stroke-[3]" /></button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 min-w-0 pr-2">
                                  <p className="font-bold text-slate-800 text-sm truncate">{item.name}</p>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">{item.quantity} un × {formatCurrency(item.price)}</p>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                  <p className="font-black text-slate-900 group-hover:text-emerald-600 transition-colors">{formatCurrency(item.quantity * item.price)}</p>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all mt-1">
                                    <button 
                                      onClick={() => {
                                        setEditHistoryItemId(item.id);
                                        setEditHistoryName(item.name);
                                        setEditHistoryQuantity(item.quantity.toString());
                                        setEditHistoryPrice(item.price.toString());
                                      }}
                                      className="p-1 text-slate-300 hover:text-emerald-500 transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => removeHistoryItem(selectedHistory.id, item.id)}
                                      className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="pt-4 border-t border-slate-100 mt-6 flex justify-between items-center px-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total da Compra</span>
                        <span className="text-2xl font-black text-emerald-600">{formatCurrency(selectedHistory.total)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* History List */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <header className="pt-12 px-6 pb-6 bg-gradient-to-b from-slate-50 to-white shrink-0">
                      <h1 className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-4">Meus Gasto</h1>
                      <div className="bg-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center shadow-xl">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Média Mensal</span>
                        <h2 className="text-3xl font-black text-white tabular-nums">
                          {formatCurrency(history.reduce((a, b) => a + b.total, 0) / (history.length || 1))}
                        </h2>
                      </div>
                    </header>
                    <div className="flex-1 px-6 overflow-hidden flex flex-col">
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Compras Realizadas ({history.length})</h3>
                      <div className="flex-1 overflow-y-auto space-y-3 pb-6 no-scrollbar">
                        {history.length === 0 ? (
                          <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                            <Clock className="w-10 h-10 mb-2 opacity-10" />
                            <p className="text-xs font-medium">Nenhum registro</p>
                          </div>
                        ) : (
                          history.map((h) => (
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              key={h.id}
                              onClick={() => setSelectedHistory(h)}
                              className="w-full flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-emerald-200 transition-all text-left group"
                            >
                              <div>
                                <p className="font-bold text-slate-800 text-sm truncate w-40 group-hover:text-emerald-700 transition-colors capitalize">{h.storeName}</p>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase mt-1">
                                  <Calendar className="w-3 h-3" /> {new Date(h.date).toLocaleDateString('pt-BR')} às {new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <span className="block font-black text-emerald-600 text-sm">{formatCurrency(h.total)}</span>
                                  <span className="text-[10px] text-slate-300 font-bold uppercase">{h.items.length} itens</span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-emerald-400 transition-colors" />
                              </div>
                            </motion.button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : activeTab === "inventory" ? (
              <motion.div 
                key="inventory"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <header className="pt-12 px-6 pb-6 bg-gradient-to-b from-slate-50 to-white shrink-0">
                  <h1 className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-4">Minha Despensa</h1>
                  <div className="bg-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center shadow-xl">
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Total de Itens</span>
                    <h2 className="text-3xl font-black text-white tabular-nums">
                      {inventory.length} tipos
                    </h2>
                  </div>
                </header>
                <div className="flex-1 px-6 overflow-hidden flex flex-col">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Estoque Atual</h3>
                  <div className="flex-1 overflow-y-auto space-y-3 pb-6 no-scrollbar">
                    {inventory.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center text-slate-300 bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                        <Box className="w-10 h-10 mb-2 opacity-10" />
                        <p className="text-xs font-medium">Estoque Vazio</p>
                      </div>
                    ) : (
                      inventory.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          className={`flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm transition-all ${item.isUsing ? 'border-l-4 border-l-blue-400' : ''}`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 truncate leading-tight">{item.name}</span>
                              {item.isUsing && (
                                <span className="bg-blue-50 text-blue-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-tighter">Em Uso</span>
                              )}
                              {item.quantity <= 1 && (
                                <span className="bg-red-50 text-red-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-tighter animate-pulse">Acabando</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'} em estoque
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={() => toggleInvUsing(item.id)}
                              className={`p-2 rounded-xl transition-all ${item.isUsing ? 'bg-blue-500 text-white shadow-lg shadow-blue-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                              title={item.isUsing ? "Parar de usar" : "Marcar como em uso"}
                            >
                              <Play className={`w-3.5 h-3.5 ${item.isUsing ? 'fill-white' : ''}`} />
                            </button>
                            <button 
                              onClick={() => updateInventoryQty(item.id, -1)}
                              className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                              title="Diminuir quantidade"
                              disabled={item.quantity === 0}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => removeFromInventory(item.id)}
                              className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                              title="Acabou / Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            ) : activeTab === "summary" ? (
              <motion.div 
                key="summary"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <header className="pt-12 px-6 pb-6 bg-gradient-to-b from-slate-50 to-white shrink-0">
                  <h1 className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-4">Resumo Financeiro</h1>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                      <span className="text-slate-400 text-[9px] font-bold uppercase tracking-widest block mb-1">Mês Atual</span>
                      <p className="text-xl font-black text-slate-800 leading-none">{formatCurrency(summaryData.currentMonthTotal)}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5">
                      <span className="text-slate-300 text-[9px] font-bold uppercase tracking-widest block mb-1">Mês Anterior</span>
                      <p className="text-xl font-black text-slate-400 leading-none">{formatCurrency(summaryData.lastMonthTotal)}</p>
                    </div>
                  </div>

                  <div className={`mt-4 rounded-2xl p-4 flex items-center justify-between ${summaryData.diffValue > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <div>
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${summaryData.diffValue > 0 ? 'text-red-400' : 'text-emerald-400'}`}>Comparação</span>
                      <p className={`text-sm font-black ${summaryData.diffValue > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {summaryData.diffValue > 0 ? 'Aumento de' : 'Economia de'} {formatCurrency(Math.abs(summaryData.diffValue))}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1 font-black text-sm ${summaryData.diffValue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {summaryData.diffValue > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {Math.abs(summaryData.diffPercent).toFixed(1)}%
                    </div>
                  </div>
                </header>

                <div className="flex-1 px-6 overflow-y-auto pb-6 space-y-6 no-scrollbar">
                  {/* Top Price Increases */}
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-4 h-4 text-slate-400" />
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Preços que mais subiram</h3>
                    </div>
                    <div className="space-y-2">
                       {summaryData.priceIncreases.length === 0 ? (
                         <p className="text-[10px] text-slate-300 italic text-center py-4 bg-slate-50 rounded-2xl">Dados insuficientes</p>
                       ) : (
                         summaryData.priceIncreases.map((item, idx) => (
                           <div key={idx} className="bg-white border border-slate-50 rounded-2xl p-3 flex items-center justify-between">
                             <span className="font-bold text-slate-700 text-sm capitalize truncate flex-1">{item.name}</span>
                             <div className="flex items-center gap-3 shrink-0">
                               <div className="text-right">
                                 <span className="text-[9px] text-slate-300 block font-bold uppercase">Ant: {formatCurrency(item.previous)}</span>
                                 <span className="text-xs font-black text-red-500">{formatCurrency(item.current)}</span>
                               </div>
                               <div className="bg-red-50 text-red-600 text-[10px] font-black px-1.5 py-1 rounded-lg">
                                 +{item.inc.toFixed(0)}%
                               </div>
                             </div>
                           </div>
                         ))
                       )}
                    </div>
                  </section>

                  {/* Top Spending Items */}
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-slate-400" />
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Maior impacto no bolso</h3>
                    </div>
                    <div className="space-y-2">
                      {summaryData.costImpact.length === 0 ? (
                         <p className="text-[10px] text-slate-300 italic text-center py-4 bg-slate-50 rounded-2xl">Sem registros</p>
                       ) : (
                         summaryData.costImpact.map((item, idx) => (
                            <div key={idx} className="bg-slate-50 rounded-2xl p-4">
                              <div className="flex justify-between items-end mb-2">
                                <span className="font-bold text-slate-700 text-sm capitalize">{item.name}</span>
                                <span className="font-black text-slate-900 text-sm">{formatCurrency(item.total)}</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(item.total / (summaryData.costImpact[0].total || 1)) * 100}%` }}
                                  className="h-full bg-slate-800 rounded-full"
                                />
                              </div>
                            </div>
                         ))
                       )}
                    </div>
                  </section>

                  {/* Market Comparison Section */}
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <LayoutGrid className="w-4 h-4 text-slate-400" />
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Comparar Mercados</h3>
                    </div>
                    
                    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 ml-1">🛒 Mercado A (Base)</label>
                          <select 
                            value={compareId1}
                            onChange={(e) => setCompareId1(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                          >
                            <option value="">Selecione uma compra...</option>
                            {history.map(h => (
                              <option key={h.id} value={h.id}>
                                {new Date(h.date).toLocaleDateString()} - {h.storeName} ({formatCurrency(h.total)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 ml-1">🛒 Mercado B (Comparação)</label>
                          <select 
                            value={compareId2}
                            onChange={(e) => setCompareId2(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                          >
                             <option value="">Selecione outra compra...</option>
                            {history.map(h => (
                              <option key={h.id} value={h.id}>
                                {new Date(h.date).toLocaleDateString()} - {h.storeName} ({formatCurrency(h.total)})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {comparisonResult ? (
                        <div className="pt-4 border-t border-slate-50 space-y-4">
                          <div className="bg-slate-900 rounded-2xl p-4 text-center">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Diferença Total</span>
                            <p className={`text-xl font-black tabular-nums ${comparisonResult.totalDiff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {comparisonResult.totalDiff > 0 ? '+' : ''}{formatCurrency(comparisonResult.totalDiff)}
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium">B em relação a A</p>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest px-1">Itens Comuns ({comparisonResult.items.length})</h4>
                            {comparisonResult.items.length === 0 ? (
                              <p className="text-[10px] text-slate-300 italic text-center py-4 bg-slate-50 rounded-2xl">Nenhum item idêntico encontrado</p>
                            ) : (
                              comparisonResult.items.map((item, idx) => (
                                <div key={idx} className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold text-slate-700 text-xs capitalize truncate block">{item.name}</span>
                                    <div className="flex gap-2 text-[8px] font-black uppercase text-slate-400">
                                      <span>A: {formatCurrency(item.price1)}</span>
                                      <span>B: {formatCurrency(item.price2)}</span>
                                    </div>
                                  </div>
                                  <div className={`shrink-0 font-black text-[10px] px-2 py-1 rounded-lg ${item.diff > 0 ? 'bg-red-100 text-red-600' : item.diff < 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                    {item.diff > 0 ? '+' : ''}{formatCurrency(item.diff)}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 flex flex-col items-center justify-center text-slate-300">
                          <PieChart className="w-8 h-8 opacity-10 mb-2" />
                          <p className="text-[10px] font-medium">Selecione duas compras para ver a economia real</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </motion.div>
            ) : activeTab === "todo" ? (
              <motion.div 
                key="todo"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <header className="pt-12 px-6 pb-6 bg-gradient-to-b from-slate-50 to-white shrink-0">
                  <h1 className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-4">Minha Lista de Faltas</h1>
                  <div className="bg-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center shadow-xl">
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Itens a Comprar</span>
                    <h2 className="text-3xl font-black text-white tabular-nums">
                      {todoItems.filter(i => !i.completed).length} itens
                    </h2>
                  </div>
                </header>

                <div className="px-6 mb-4 shrink-0">
                  <form onSubmit={handleAddTodo} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="O que está faltando?"
                      value={todoName}
                      onChange={(e) => setTodoName(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300"
                    />
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="submit"
                      className="bg-emerald-500 text-white p-3 rounded-xl shadow-lg shadow-emerald-100 flex items-center justify-center"
                    >
                      <Plus className="w-6 h-6 stroke-[3]" />
                    </motion.button>
                  </form>
                </div>

                <div className="flex-1 px-6 overflow-hidden flex flex-col">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Lista de Compras</h3>
                    {todoItems.some(i => i.completed) && (
                      <button 
                        onClick={clearCompletedTodos}
                        className="text-[9px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                      >
                        Limpar Comprados
                      </button>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-2 pb-6 no-scrollbar">
                    {todoItems.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center text-slate-300 bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                        <ShoppingBasket className="w-10 h-10 mb-2 opacity-10" />
                        <p className="text-xs font-medium">Tudo em dia por aqui!</p>
                      </div>
                    ) : (
                      todoItems.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          className={`flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm transition-all ${item.completed ? 'opacity-50 grayscale' : ''}`}
                        >
                          <button 
                            onClick={() => toggleTodo(item.id)}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${item.completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 hover:border-emerald-400'}`}
                          >
                            {item.completed && <Check className="w-4 h-4 text-white stroke-[4]" />}
                          </button>
                          
                          <span 
                            onClick={() => toggleTodo(item.id)}
                            className={`flex-1 text-sm font-bold text-slate-700 cursor-pointer ${item.completed ? 'line-through text-slate-400' : ''}`}
                          >
                            {item.name}
                          </span>

                          <button 
                            onClick={() => removeTodo(item.id)}
                            className="p-1 text-slate-200 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Settings/Placeholder - Fallback */
              <motion.div key="settings" className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4">
                <Settings className="w-12 h-12 opacity-10" />
                <p className="text-xs font-medium">Configurações</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Navigation */}
        <nav className="px-4 pb-8 pt-4 flex justify-between border-t border-slate-50 bg-white shrink-0 z-30">
          <button 
            onClick={() => { setActiveTab("current"); setSelectedHistory(null); }}
            className={`transition-all duration-300 flex flex-col items-center gap-1 flex-1 ${activeTab === "current" ? "text-emerald-500 scale-105" : "text-slate-300 hover:text-slate-400"}`}
          >
            <LayoutGrid className="w-5 h-5 flex-shrink-0" />
            <span className="text-[7px] font-black uppercase tracking-tighter">Lista</span>
          </button>
          <button 
            onClick={() => { setActiveTab("inventory"); setSelectedHistory(null); }}
            className={`transition-all duration-300 flex flex-col items-center gap-1 flex-1 ${activeTab === "inventory" ? "text-emerald-500 scale-105" : "text-slate-300 hover:text-slate-400"}`}
          >
            <Box className="w-5 h-5 flex-shrink-0" />
            <span className="text-[7px] font-black uppercase tracking-tighter">Estoque</span>
          </button>
          <button 
            onClick={() => { setActiveTab("summary"); setSelectedHistory(null); }}
            className={`transition-all duration-300 flex flex-col items-center gap-1 flex-1 ${activeTab === "summary" ? "text-emerald-500 scale-105" : "text-slate-300 hover:text-slate-400"}`}
          >
            <PieChart className="w-5 h-5 flex-shrink-0" />
            <span className="text-[7px] font-black uppercase tracking-tighter">Resumo</span>
          </button>
          <button 
            onClick={() => { setActiveTab("history"); setSelectedHistory(null); }}
            className={`transition-all duration-300 flex flex-col items-center gap-1 flex-1 ${activeTab === "history" ? "text-emerald-500 scale-105" : "text-slate-300 hover:text-slate-400"}`}
          >
            <Clock className="w-5 h-5 flex-shrink-0" />
            <span className="text-[7px] font-black uppercase tracking-tighter">Histórico</span>
          </button>
          <button 
            onClick={() => setActiveTab("todo")}
            className={`transition-all duration-300 flex flex-col items-center gap-1 flex-1 ${activeTab === "todo" ? "text-emerald-500 scale-105" : "text-slate-300 hover:text-slate-400"}`}
          >
            <ListTodo className="w-5 h-5 flex-shrink-0" />
            <span className="text-[7px] font-black uppercase tracking-tighter">A Comprar</span>
          </button>
        </nav>

        {/* Scanner Overlay */}
        <AnimatePresence>
          {isScannerOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black z-50 flex flex-col pt-12"
            >
              <div className="flex justify-between items-center px-6 mb-4">
                <div className="flex flex-col">
                  <h3 className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                    <Scan className="w-4 h-4 text-emerald-400" /> Leitor Gemini Vision
                  </h3>
                </div>
                <button onClick={stopScanner} className="text-white/50 hover:text-white transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 relative bg-slate-900 mx-4 rounded-3xl overflow-hidden border border-white/10 shadow-inner">
                {!scannedResult ? (
                  <>
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover"
                    />
                    {/* Scanner Guides with darkened background */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute inset-0 bg-black/40" style={{ clipPath: 'polygon(0% 0%, 0% 100%, 10% 100%, 10% 30%, 90% 30%, 90% 70%, 10% 70%, 10% 100%, 100% 100%, 100% 0%)' }} />
                      
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-72 h-40 border border-emerald-400/30 rounded-3xl flex items-center justify-center relative bg-transparent overflow-hidden">
                          {/* Highlighted Corners */}
                          <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl" />
                          <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl" />
                          <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl" />
                          <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl" />
                          
                          {/* Animated Scanning Line */}
                          <motion.div 
                            animate={{ top: ['10%', '90%', '10%'] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="absolute left-4 right-4 h-0.5 bg-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,0.8)] z-10"
                          />

                          <div className="flex flex-col items-center gap-1 z-20">
                            <div className="bg-emerald-500/20 p-2 rounded-full backdrop-blur-sm">
                              <Scan className="w-6 h-6 text-emerald-400 animate-pulse" />
                            </div>
                            <span className="text-white text-[10px] font-black uppercase tracking-widest text-center px-4 drop-shadow-lg">Posicione a etiqueta</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        disabled={isAnalyzing}
                        onClick={captureAndAnalyze}
                        className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all ${isAnalyzing ? 'border-slate-700 bg-slate-800' : 'border-white bg-emerald-500'}`}
                      >
                        {isAnalyzing ? (
                          <Loader2 className="w-8 h-8 text-white animate-spin" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-white/20" />
                        )}
                      </motion.button>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 bg-slate-900 p-6 flex flex-col justify-center overflow-y-auto">
                    <div className="bg-white rounded-3xl p-6 shadow-2xl">
                      <div className="flex items-center gap-2 mb-6">
                        <div className="bg-emerald-100 p-2 rounded-xl">
                          <Scan className="w-5 h-5 text-emerald-600" />
                        </div>
                        <h4 className="text-slate-800 font-bold uppercase text-[10px] tracking-widest leading-none">Confirmar Dados</h4>
                      </div>

                      <div className="mb-6">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Produto sugerido</label>
                        <input 
                          type="text"
                          value={scannedName}
                          onChange={(e) => setScannedName(e.target.value)}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-slate-800 font-bold focus:border-emerald-500 focus:outline-none transition-colors"
                          placeholder="Nome do produto"
                        />
                      </div>

                      <div className="mb-6">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 px-1 text-center">Preços encontrados</label>
                        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                          {scannedResult.prices.map((p, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedScannedPrice(p.value)}
                              className={`w-full py-3 px-4 rounded-2xl flex justify-between items-center transition-all ${
                                selectedScannedPrice === p.value 
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 border-2 border-emerald-500' 
                                : 'bg-slate-50 text-slate-600 border-2 border-slate-100'
                              }`}
                            >
                              <span className="text-[10px] font-black uppercase tracking-wider">
                                {p.label}
                              </span>
                              <span className="text-sm font-black">{formatCurrency(p.value)}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <motion.button 
                          whileTap={{ scale: 0.98 }}
                          disabled={!selectedScannedPrice}
                          onClick={addItemFromScanner}
                          className="w-full py-4 rounded-2xl bg-slate-800 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all flex justify-center items-center gap-2"
                        >
                          Confirmar e Adicionar
                        </motion.button>

                        <button 
                          onClick={() => setScannedResult(null)}
                          className="w-full py-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
                        >
                          TIRAR OUTRA FOTO
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {scannerError && !isAnalyzing && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-500 text-white p-4 rounded-2xl text-center w-64 shadow-xl">
                    <p className="text-[10px] font-black uppercase mb-2">Erro</p>
                    <p className="text-xs font-medium leading-tight">{scannerError}</p>
                    <button onClick={startScanner} className="mt-4 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-colors duration-300">Tentar Novamente</button>
                  </div>
                )}
              </div>

              <div className="p-8 text-center flex flex-col items-center gap-2">
                <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                  <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-[7px] text-emerald-400 font-black uppercase tracking-tighter">Análise Avançada por Gemini 3.1 Pro</span>
                </div>
              </div>

              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}





