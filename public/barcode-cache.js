const DATABASE_NAME = "burgerops-barcode-cache";
const DATABASE_VERSION = 1;
const STORE_NAME = "products";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "barcode" });
        store.createIndex("updatedAt", "updatedAt");
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error || new Error("Nao foi possivel abrir o cache local.")));
  });
}

async function withStore(mode, callback) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    let request;

    try {
      request = callback(store);
    } catch (error) {
      reject(error);
      return;
    }

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error || new Error("Falha no cache local.")));
    transaction.addEventListener("complete", () => database.close());
    transaction.addEventListener("error", () => {
      database.close();
      reject(transaction.error || new Error("Nao foi possivel concluir a operacao no cache local."));
    });
    transaction.addEventListener("abort", () => {
      database.close();
      reject(transaction.error || new Error("A operacao no cache local foi abortada."));
    });
  });
}

export async function getCachedBarcodeProduct(barcode) {
  const normalizedBarcode = String(barcode ?? "").replace(/\D/g, "");

  if (!normalizedBarcode) {
    return null;
  }

  return withStore("readonly", (store) => store.get(normalizedBarcode));
}

export async function saveCachedBarcodeProduct(product) {
  const normalizedBarcode = String(product?.barcode ?? "").replace(/\D/g, "");

  if (!normalizedBarcode) {
    throw new Error("Codigo de barras invalido para salvar no cache local.");
  }

  const payload = {
    barcode: normalizedBarcode,
    nome: String(product?.nome ?? "").trim(),
    marca: String(product?.marca ?? "").trim(),
    categoria: String(product?.categoria ?? "").trim(),
    fonte: String(product?.fonte ?? "manual").trim() || "manual",
    updatedAt: new Date().toISOString()
  };

  return withStore("readwrite", (store) => store.put(payload));
}
