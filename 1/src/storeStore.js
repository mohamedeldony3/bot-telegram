const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const productsFile = path.join(dataDir, "store_products.json");
const ordersFile = path.join(dataDir, "store_orders.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

function loadProducts() {
  if (!fs.existsSync(productsFile)) return [];
  return JSON.parse(fs.readFileSync(productsFile));
}

function saveProducts(p) {
  fs.writeFileSync(productsFile, JSON.stringify(p, null, 2));
}

function loadOrders() {
  if (!fs.existsSync(ordersFile)) return [];
  return JSON.parse(fs.readFileSync(ordersFile));
}

function saveOrders(o) {
  fs.writeFileSync(ordersFile, JSON.stringify(o, null, 2));
}

module.exports = {
  getProducts() {
    return loadProducts().filter(p => p.active);
  },

  getProductById(id) {
    return loadProducts().find(p => p.id === id);
  },

  createOrder({ userId, productId }) {
    let products = loadProducts();
    let product = products.find(p => p.id === productId);

    if (product.deliveryType === "auto") {
      if (product.stock <= 0) {
        throw { code: "OUT_OF_STOCK" };
      }

      product.stock -= 1;
      saveProducts(products);
    }

    let orders = loadOrders();

    let order = {
      id: Date.now(),
      userId,
      productId,
      deliveryType: product.deliveryType,
      message: product.message,
      status: "completed",
      date: new Date().toISOString()
    };

    orders.push(order);
    saveOrders(orders);

    return order;
  },

  listUserOrders(uid) {
    return loadOrders().filter(o => o.userId === uid);
  }
};