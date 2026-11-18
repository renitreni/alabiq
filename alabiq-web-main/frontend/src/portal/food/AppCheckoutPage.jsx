// ---------------------------------------------------------------------
// One restaurant — one app: /app/:hash/checkout
// Thin wrapper: same checkout as /food/checkout?m=, merchant pinned from
// context and payment/tracking stay inside the scope. The server still
// recomputes all money and validates the merchant on its own.
// ---------------------------------------------------------------------
import { useRestaurantApp } from './AppShell';
import FoodCheckoutPage from './FoodCheckoutPage';

export default function AppCheckoutPage() {
  const { restaurant, basePath } = useRestaurantApp();
  return <FoodCheckoutPage merchantId={restaurant.id} basePath={basePath} />;
}
