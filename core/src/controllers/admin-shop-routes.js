const { registerAdminDecorationShopRoutes } = require("./admin-decoration-shop-routes");
  const { registerAdminMallRoutes } = require("./admin-mall-routes");
  const { registerAdminPetShopRoutes } = require("./admin-pet-shop-routes");
  const { registerAdminSeedShopRoutes } = require("./admin-seed-shop-routes");
  const { registerAdminShopDebugRoutes } = require("./admin-shop-debug-routes");
  const { registerAdminShopPurchaseRoutes } = require("./admin-shop-purchase-routes");

function registerAdminShopRoutes(context) {
  registerAdminMallRoutes(context);
  registerAdminPetShopRoutes(context);
  registerAdminSeedShopRoutes(context);
  registerAdminShopDebugRoutes(context);
  registerAdminDecorationShopRoutes(context);
  registerAdminShopPurchaseRoutes(context);
}

module.exports = { registerAdminShopRoutes };
