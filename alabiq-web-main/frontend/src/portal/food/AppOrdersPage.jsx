// ---------------------------------------------------------------------
// One restaurant — one app: /app/:hash/orders
// Thin wrapper: the customer's food order history with every exit link
// scoped to this restaurant's subtree.
// ---------------------------------------------------------------------
import { useRestaurantApp } from './AppShell';
import FoodOrdersPage from './FoodOrdersPage';

export default function AppOrdersPage() {
  const { basePath } = useRestaurantApp();
  return <FoodOrdersPage basePath={basePath} />;
}
