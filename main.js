const GEMINI_ENDPOINT = "/api/gemini";
const CACHE_PREFIX = "canasta-gemini-cache:";

const modal = document.querySelector("#welcome-modal");
const closeButton = document.querySelector("#modal-close");
const modalAction = document.querySelector("#modal-action");
const productGrid = document.querySelector("#product-grid");
const catalog = document.querySelector("#productos");
const productDetail = document.querySelector("#product-detail");
const backToCatalog = document.querySelector("#back-to-catalog");
const detailImage = document.querySelector("#detail-image");
const detailStore = document.querySelector("#detail-store");
const detailName = document.querySelector("#detail-name");
const detailStars = document.querySelector("#detail-stars");
const detailScore = document.querySelector("#detail-score");
const detailPrice = document.querySelector("#detail-price");
const detailCalories = document.querySelector("#detail-calories");
const detailProtein = document.querySelector("#detail-protein");
const detailFat = document.querySelector("#detail-fat");
const addToCartButton = document.querySelector("#add-to-cart");
const basketButton = document.querySelector(".basket-button");
const basketTotalElement = document.querySelector(".basket-button strong");
const aiRatingContent = document.querySelector("#ai-rating-content");
const chatToggle = document.querySelector("#chat-toggle");
const chatPanel = document.querySelector("#chat-panel");
const chatClose = document.querySelector("#chat-close");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector("#chat-messages");
const carrito = [];
const chatHistory = [];
let selectedProduct = null;

const readCachedResponse = (key) => {
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

const writeCachedResponse = (key, text) => {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(text));
  } catch {
    // La respuesta sigue siendo válida aunque el navegador bloquee localStorage.
  }
};

const products = [
  {
    id: "brocoli-mercadona-01",
    nombre: "Brócoli fresco",
    imagen: "https://placehold.co/600x480/e7f2df/527a35?text=Br%C3%B3coli",
    precio: 1.89,
    supermercado: "Mercadona",
    informacionNutricional: { calorias: 34, proteinas: 2.8, grasas: 0.4 },
    puntuacion: 4.6,
  },
  {
    id: "manzana-lidl-02",
    nombre: "Manzana roja",
    imagen: "https://placehold.co/600x480/f8e8e2/a04f43?text=Manzana",
    precio: 2.10,
    supermercado: "Lidl",
    informacionNutricional: { calorias: 52, proteinas: 0.3, grasas: 0.2 },
    puntuacion: 4.4,
  },
  {
    id: "leche-carrefour-03",
    nombre: "Leche entera",
    imagen: "https://placehold.co/600x480/f1eee2/8a6c38?text=Leche",
    precio: 0.95,
    supermercado: "Carrefour",
    informacionNutricional: { calorias: 61, proteinas: 3.2, grasas: 3.3 },
    puntuacion: 4.2,
  },
  {
    id: "avena-mercadona-04",
    nombre: "Copos de avena",
    imagen: "https://placehold.co/600x480/eaf0df/527a35?text=Avena",
    precio: 1.65,
    supermercado: "Mercadona",
    informacionNutricional: { calorias: 389, proteinas: 16.9, grasas: 6.9 },
    puntuacion: 4.8,
  },
];

const renderProducts = (items) => {
  productGrid.innerHTML = items.map((product) => `
    <article class="product-card" tabindex="0" data-product-id="${product.id}" aria-label="${product.nombre}, ${product.precio.toFixed(2)} euros">
      <img class="product-image" src="${product.imagen}" alt="${product.nombre}">
      <div class="product-card-content">
        <strong>${product.nombre}</strong>
        <small>${product.supermercado} · ★ ${product.puntuacion.toFixed(1)}</small>
        <b>${product.precio.toFixed(2)} €</b>
      </div>
    </article>
  `).join("");
};

const renderStars = (rating) => {
  detailStars.innerHTML = "";
  for (let index = 1; index <= 5; index += 1) {
    const star = document.createElement("span");
    star.className = "detail-star";
    star.textContent = "★";
    if (rating >= index) {
      star.classList.add("filled");
    } else if (rating >= index - 0.5) {
      star.classList.add("half");
    }
    detailStars.appendChild(star);
  }
};

const showProductDetail = (product) => {
  selectedProduct = product;
  detailImage.src = product.imagen;
  detailImage.alt = product.nombre;
  detailStore.textContent = product.supermercado;
  detailName.textContent = product.nombre;
  detailScore.textContent = `${product.puntuacion.toFixed(1)} / 5`;
  detailPrice.textContent = `${product.precio.toFixed(2)} €`;
  detailCalories.textContent = `${product.informacionNutricional.calorias} kcal`;
  detailProtein.textContent = `${product.informacionNutricional.proteinas} g`;
  detailFat.textContent = `${product.informacionNutricional.grasas} g`;
  renderStars(product.puntuacion);
  catalog.classList.add("is-hidden");
  productDetail.classList.remove("is-hidden");
  productDetail.scrollIntoView({ behavior: "smooth", block: "start" });
  obtenerValoracionIA(product);
};

const showCatalog = () => {
  productDetail.classList.add("is-hidden");
  catalog.classList.remove("is-hidden");
  catalog.scrollIntoView({ behavior: "smooth", block: "start" });
};

const updateCartTotal = () => {
  const total = carrito.reduce((sum, product) => sum + product.precio, 0);
  basketTotalElement.textContent = `${total.toFixed(2)} €`;
  basketButton.classList.remove("basket-updated");
  void basketButton.offsetWidth;
  basketButton.classList.add("basket-updated");
};

const solicitarGemini = async (prompt, options = {}) => {
  const cacheKey = options.cacheKey || JSON.stringify({
    prompt: prompt.trim(),
    history: options.history || [],
    systemInstruction: options.systemInstruction || "",
  });
  const cachedResponse = readCachedResponse(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      history: options.history || [],
      systemInstruction: options.systemInstruction,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Error del endpoint (${response.status}).`);
  }
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) {
    throw new Error("El endpoint no devolvió una respuesta.");
  }
  writeCachedResponse(cacheKey, text);
  return text;
};

async function obtenerValoracionIA(producto) {
  aiRatingContent.textContent = "Cargando...";
  try {
    const { calorias, proteinas, grasas } = producto.informacionNutricional;
    const prompt = `Responde estrictamente en una sola frase breve a cuántas personas puede alimentar una unidad de este producto. Producto: ${producto.nombre}. Valores nutricionales por unidad o referencia: ${calorias} kcal, ${proteinas} g de proteínas y ${grasas} g de grasas. No añadas listas, explicaciones ni más de una frase.`;
    const response = await solicitarGemini(prompt, {
      cacheKey: `review:${producto.id}`,
      systemInstruction: "Eres un asistente nutricional preciso y prudente.",
      maxOutputTokens: 120,
    });
    aiRatingContent.textContent = response;
  } catch (error) {
    aiRatingContent.textContent = `No se pudo obtener la valoración: ${error.message}`;
  }
}

renderProducts(products);

productGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }
  const product = products.find((item) => item.id === card.dataset.productId);
  if (product) {
    showProductDetail(product);
  }
});

productGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }
  event.preventDefault();
  const product = products.find((item) => item.id === card.dataset.productId);
  if (product) {
    showProductDetail(product);
  }
});

backToCatalog.addEventListener("click", showCatalog);
addToCartButton.addEventListener("click", () => {
  if (selectedProduct) {
    carrito.push(selectedProduct);
    updateCartTotal();
  }
});

const setChatOpen = (isOpen) => {
  chatPanel.classList.toggle("is-open", isOpen);
  chatPanel.setAttribute("aria-hidden", String(!isOpen));
  chatToggle.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    chatInput.focus();
  }
};

const addChatBubble = (message, role) => {
  const bubble = document.createElement("p");
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = message;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
};

const sendChatMessage = async (message) => {
  chatHistory.push({ role: "user", parts: [{ text: message }] });
  const loadingBubble = addChatBubble("Cargando...", "assistant loading");
  chatInput.disabled = true;
  try {
    const response = await solicitarGemini(message, {
      cacheKey: `chat:${message.trim().toLocaleLowerCase()}`,
      history: chatHistory.slice(0, -1),
      systemInstruction: "Eres un asistente nutricional y de ahorro para compras de supermercado. Ayuda a elegir opciones saludables, comparar precios y planificar compras. Responde en español, con claridad y de forma breve.",
    });
    chatHistory.push({ role: "model", parts: [{ text: response }] });
    loadingBubble.textContent = response;
    loadingBubble.classList.remove("loading");
  } catch (error) {
    loadingBubble.textContent = `No se pudo responder: ${error.message}`;
    loadingBubble.classList.remove("loading");
    loadingBubble.classList.add("error");
    chatHistory.pop();
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
};

chatToggle.addEventListener("click", () => setChatOpen(!chatPanel.classList.contains("is-open")));
chatClose.addEventListener("click", () => setChatOpen(false));
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || chatInput.disabled) {
    return;
  }
  addChatBubble(message, "user");
  chatInput.value = "";
  sendChatMessage(message);
});
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

const closeModal = () => {
  modal.classList.add("is-hidden");
  document.body.classList.remove("modal-open");
};

closeButton.addEventListener("click", closeModal);
modalAction.addEventListener("click", closeModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.classList.contains("is-hidden")) {
    closeModal();
  }
});
