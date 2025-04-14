"use strict";

// ----- IndexedDB inicializálása -----
let db;
const dbName = "penzugyiNaploDB";
const dbVersion = 1;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onerror = (event) => {
      console.error("IndexedDB hiba:", event);
      reject(event);
    };
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve();
    };
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains("transactions")) {
        db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains("savings")) {
        db.createObjectStore("savings", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("budget")) {
        db.createObjectStore("budget", { keyPath: "id" });
      }
    };
  });
}

// ----- Globális változók -----
let transactions = [];
const defaultCategories = [
  { name: "Egyéb", color: "#000000", icon: "❓" },
  { name: "Étel", color: "#FF5722", icon: "🍔" },
  { name: "Utazás", color: "#3F51B5", icon: "✈️" }
];
let categories = [];
let monthlyBudget = 0;
let currentMonthExpenses = 0;
let localSavingsBalance = 0;
let chart;

// ----- DOM elemek -----
const appContent = document.getElementById("app-content");
const transactionForm = document.getElementById("transaction-form");
const transactionTypeEl = document.getElementById("transaction-type");
const amountInput = document.getElementById("amount");
const descriptionInput = document.getElementById("description");
const transactionList = document.getElementById("transaction-list");
const searchInput = document.getElementById("search-input");
const categorySelect = document.getElementById("category");
const customCategoryForm = document.getElementById("custom-category-form");
const newCategoryInput = document.getElementById("new-category");
const newCategoryColorInput = document.getElementById("new-category-color");
const newCategoryIconInput = document.getElementById("new-category-icon");
const categoryList = document.getElementById("category-list");
const savingsForm = document.getElementById("savings-form");
const savingsBalanceEl = document.getElementById("savings-balance");
const budgetForm = document.getElementById("budget-form");
const monthlyBudgetInput = document.getElementById("monthly-budget");
const monthlyExpensesEl = document.getElementById("monthly-expenses");
const budgetRemainingEl = document.getElementById("budget-remaining");
const exportBtn = document.getElementById("export-btn");
const importFileInput = document.getElementById("import-file");
const importBtn = document.getElementById("import-btn");
const notifyBtn = document.getElementById("notify-btn");

// ----- IndexedDB műveletek -----
function saveDefaultCategories() {
  const tx = db.transaction("categories", "readwrite");
  const store = tx.objectStore("categories");
  defaultCategories.forEach(cat => {
    store.put(cat);
  });
}

function getCategoriesFromDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("categories", "readonly");
    const store = tx.objectStore("categories");
    const request = store.getAll();
    request.onerror = e => reject(e);
    request.onsuccess = e => resolve(e.target.result);
  });
}

function getTransactionsFromDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("transactions", "readonly");
    const store = tx.objectStore("transactions");
    const request = store.getAll();
    request.onerror = e => reject(e);
    request.onsuccess = e => resolve(e.target.result);
  });
}

function addTransactionToDB(txData) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    const request = store.add(txData);
    request.onerror = e => reject(e);
    request.onsuccess = e => resolve({ ...txData, id: e.target.result });
  });
}

function deleteTransactionFromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    const request = store.delete(id);
    request.onerror = e => reject(e);
    request.onsuccess = () => resolve();
  });
}

function updateSavingsInDB(newBalance) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("savings", "readwrite");
    const store = tx.objectStore("savings");
    store.clear().onsuccess = () => {
      store.add({ id: 1, balance: newBalance }).onsuccess = () => resolve();
    };
  });
}

function getSavingsFromDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("savings", "readonly");
    const store = tx.objectStore("savings");
    const request = store.get(1);
    request.onerror = e => reject(e);
    request.onsuccess = e => resolve(e.target.result ? e.target.result.balance : 0);
  });
}

function updateBudgetInDB(newBudget) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("budget", "readwrite");
    const store = tx.objectStore("budget");
    store.clear().onsuccess = () => {
      store.add({ id: 1, amount: newBudget }).onsuccess = () => resolve();
    };
  });
}

function getBudgetFromDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("budget", "readonly");
    const store = tx.objectStore("budget");
    const request = store.get(1);
    request.onerror = e => reject(e);
    request.onsuccess = e => resolve(e.target.result ? e.target.result.amount : 0);
  });
}

// ----- Adatok betöltése és UI frissítése -----
async function loadAppData() {
  // Kategóriák betöltése
  let catData = await getCategoriesFromDB();
  if (catData.length === 0) {
    saveDefaultCategories();
    catData = defaultCategories;
  }
  categories = catData;
  renderCategoryOptions();
  renderCategoryManagement();
  
  // Tranzakciók betöltése
  transactions = await getTransactionsFromDB();
  renderTransactions(transactions);
  
  // Megtakarítás betöltése
  localSavingsBalance = await getSavingsFromDB();
  savingsBalanceEl.textContent = localSavingsBalance.toFixed(2);
  
  // Költségvetés betöltése
  monthlyBudget = await getBudgetFromDB();
  monthlyBudgetInput.value = monthlyBudget;
  updateBudgetDisplay();
  
  updateMonthlyExpenses();
  updateChart();
}

// ----- UI frissítési függvények -----
function renderCategoryOptions() {
  categorySelect.innerHTML = "";
  categories.forEach(cat => {
    const option = document.createElement("option");
    option.value = cat.name;
    option.textContent = `${cat.icon} ${cat.name}`;
    categorySelect.appendChild(option);
  });
}

function renderCategoryManagement() {
  categoryList.innerHTML = "";
  categories.forEach(cat => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    const colorIcon = document.createElement("div");
    colorIcon.classList.add("category-color-icon");
    colorIcon.style.backgroundColor = cat.color;
    span.appendChild(colorIcon);
    span.appendChild(document.createTextNode(` ${cat.icon} ${cat.name}`));
    li.appendChild(span);
    
    const editBtn = document.createElement("button");
    editBtn.textContent = "Szerkesztés";
    editBtn.addEventListener("click", () => editCategory(cat));
    const delBtn = document.createElement("button");
    delBtn.textContent = "Törlés";
    delBtn.addEventListener("click", () => {
      if (confirm(`Biztos törlöd a(z) ${cat.name} kategóriát?`)) {
        deleteCategory(cat.name);
      }
    });
    li.appendChild(editBtn);
    li.appendChild(delBtn);
    categoryList.appendChild(li);
  });
}

function editCategory(cat) {
  const newName = prompt("Új név:", cat.name);
  if (newName && newName.trim() !== "") {
    const newColor = prompt("Új szín (pl.: #FF5722):", cat.color);
    const newIcon = prompt("Új ikon (emoji):", cat.icon);
    const updatedCat = { name: newName.trim(), color: newColor || cat.color, icon: newIcon || cat.icon };
    deleteCategory(cat.name).then(() => {
      const tx = db.transaction("categories", "readwrite");
      const store = tx.objectStore("categories");
      store.put(updatedCat).onsuccess = () => loadAppData();
    });
  }
}

function deleteCategory(categoryName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("categories", "readwrite");
    const store = tx.objectStore("categories");
    const request = store.delete(categoryName);
    request.onerror = e => reject(e);
    request.onsuccess = () => {
      categories = categories.filter(cat => cat.name !== categoryName);
      renderCategoryOptions();
      renderCategoryManagement();
      resolve();
    };
  });
}

function renderTransactions(transList) {
  transactionList.innerHTML = "";
  transList.forEach(tx => {
    const li = document.createElement("li");
    const date = new Date(tx.timestamp).toLocaleDateString("hu-HU");
    li.innerHTML = `[${date}] ${tx.type.toUpperCase()} - ${tx.amount.toFixed(2)} Ft - ${tx.category} - ${tx.description} `;
    const delBtn = document.createElement("button");
    delBtn.textContent = "Törlés";
    delBtn.addEventListener("click", () => {
      deleteTransactionFromDB(tx.id).then(() => loadAppData());
    });
    li.appendChild(delBtn);
    transactionList.appendChild(li);
  });
}

function updateMonthlyExpenses() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  let expenses = 0;
  transactions.forEach(tx => {
    const txDate = new Date(tx.timestamp);
    if (tx.type === "kiadás" && txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
      expenses += tx.amount;
    }
  });
  currentMonthExpenses = expenses;
  monthlyExpensesEl.textContent = expenses.toFixed(2);
  updateBudgetDisplay();
  if (monthlyBudget && expenses > monthlyBudget) {
    sendNotification("Költségvetési figyelmeztetés", "A havi kiadások meghaladták a beállított költségvetést!");
  }
}

function updateBudgetDisplay() {
  if (monthlyBudget) {
    const remaining = monthlyBudget - currentMonthExpenses;
    budgetRemainingEl.textContent = remaining.toFixed(2);
  }
}

function updateChart() {
  const expensePerCategory = {};
  transactions.forEach(tx => {
    if (tx.type === "kiadás") {
      expensePerCategory[tx.category] = (expensePerCategory[tx.category] || 0) + tx.amount;
    }
  });
  const labels = Object.keys(expensePerCategory);
  const data = Object.values(expensePerCategory);
  const ctx = document.getElementById("transactions-chart").getContext("2d");
  if (chart) chart.destroy();
  Chart.register(ChartDataLabels);
  chart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [{
        label: "Kiadások kategóriánként",
        data: data,
        backgroundColor: labels.map(catName => {
          const cat = categories.find(c => c.name === catName);
          return cat ? cat.color : "#ccc";
        }),
      }]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
              const currentValue = context.parsed;
              const percentage = total ? ((currentValue / total) * 100).toFixed(2) : 0;
              return context.label + ": " + percentage + "% (" + currentValue.toFixed(2) + " Ft)";
            }
          }
        },
        datalabels: {
          formatter: (value, ctx) => {
            const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            const percentage = total ? ((value / total) * 100).toFixed(2) + "%" : "0%";
            return percentage;
          },
          color: "#fff",
          font: { weight: "bold" }
        },
      }
    }
  });
}

// ----- Push értesítések -----
function sendNotification(title, body) {
  if (!("Notification" in window)) {
    alert("Ez a böngésző nem támogatja az értesítéseket.");
    return;
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") new Notification(title, { body });
    });
  }
}
if (Notification.permission !== "granted") {
  Notification.requestPermission();
}

// ----- Eseménykezelők -----
transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const type = transactionTypeEl.value;
  const amount = parseFloat(amountInput.value);
  const cat = categorySelect.value;
  const description = descriptionInput.value;
  if (isNaN(amount)) {
    alert("Kérlek, adj meg egy érvényes összeget.");
    return;
  }
  const txData = {
    type,
    amount,
    category: cat,
    description,
    timestamp: new Date().toISOString()
  };
  try {
    const newTx = await addTransactionToDB(txData);
    transactions.unshift(newTx);
    renderTransactions(transactions);
    updateMonthlyExpenses();
    updateChart();
    transactionForm.reset();
  } catch (e) {
    console.error(e);
  }
});

searchInput.addEventListener("input", () => {
  const query = searchInput.value.toLowerCase();
  const filtered = transactions.filter(tx =>
    tx.category.toLowerCase().includes(query) ||
    tx.description.toLowerCase().includes(query)
  );
  renderTransactions(filtered);
});

customCategoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const newCatName = newCategoryInput.value.trim();
  const newCatColor = newCategoryColorInput.value;
  const newCatIcon = newCategoryIconInput.value.trim() || "❓";
  if (newCatName === "") {
    alert("Kérlek, adj meg egy kategória nevet.");
    return;
  }
  if (categories.some(cat => cat.name.toLowerCase() === newCatName.toLowerCase())) {
    alert("Ez a kategória már létezik.");
    return;
  }
  const newCat = { name: newCatName, color: newCatColor, icon: newCatIcon };
  const tx = db.transaction("categories", "readwrite");
  const store = tx.objectStore("categories");
  store.put(newCat).onsuccess = () => loadAppData();
  customCategoryForm.reset();
});

savingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = parseFloat(document.getElementById("savings-amount").value);
  const opType = document.getElementById("savings-type").value;
  if (isNaN(amount)) {
    alert("Kérlek, adj meg érvényes összeget.");
    return;
  }
  if (opType === "befizetés") {
    localSavingsBalance += amount;
  } else if (opType === "kivonás") {
    localSavingsBalance -= amount;
  }
  savingsBalanceEl.textContent = localSavingsBalance.toFixed(2);
  await updateSavingsInDB(localSavingsBalance);
  savingsForm.reset();
});

budgetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  monthlyBudget = parseFloat(monthlyBudgetInput.value);
  if (isNaN(monthlyBudget)) {
    alert("Kérlek, adj meg érvényes költségvetést.");
    return;
  }
  await updateBudgetInDB(monthlyBudget);
  updateBudgetDisplay();
  budgetForm.reset();
});

exportBtn.addEventListener("click", () => {
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "type,amount,category,description,timestamp\n";
  transactions.forEach(tx => {
    const row = `${tx.type},${tx.amount},${tx.category},${tx.description},${tx.timestamp}`;
    csvContent += row + "\n";
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "transactions.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

importBtn.addEventListener("click", () => {
  const file = importFileInput.files[0];
  if (!file) {
    alert("Kérlek, válassz egy CSV fájlt.");
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split("\n").slice(1);
    for (const line of lines) {
      if (line.trim() !== "") {
        const parts = line.split(",");
        const [type, amount, category, description, timestamp] = parts;
        const newTx = {
          type,
          amount: parseFloat(amount),
          category,
          description,
          timestamp
        };
        await addTransactionToDB(newTx);
      }
    }
    loadAppData();
  };
  reader.readAsText(file);
});

notifyBtn.addEventListener("click", () => {
  sendNotification("Teszt Értesítés", "Ez egy teszt push értesítés.");
});

// ----- Inicializálás -----
// Ebben a verzió az alkalmazás tartalma azonnal látható, mivel nincs PIN védelem.
window.addEventListener("load", async () => {
  appContent.style.display = "block";
  await initDB();
  loadAppData();
});
