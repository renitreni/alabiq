// ---------------------------------------------------------------------
// One restaurant — one app: /app/:hash/cart
// Thin wrapper: same cart as /food/cart?m=, merchant pinned from context
// and checkout stays inside the scope.
// ---------------------------------------------------------------------
import { useRestaurantApp } from './AppShell';
import FoodCartPage from './FoodCartPage';

export default function AppCartPage() {
  const { restaurant, basePath } = useRestaurantApp();
  return <FoodCartPage merchantId={restaurant.id} basePath={basePath} />;
}
