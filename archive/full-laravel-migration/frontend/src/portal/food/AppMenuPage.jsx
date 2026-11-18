// ---------------------------------------------------------------------
// One restaurant — one app: /app/:hash (menu)
// Thin wrapper: pins RestaurantPage to the hash-resolved merchant and
// keeps every exit path (cart, login, back) inside the scope.
// ---------------------------------------------------------------------
import { useRestaurantApp } from './AppShell';
import RestaurantPage from './RestaurantPage';

export default function AppMenuPage() {
  const { restaurant, basePath } = useRestaurantApp();
  return <RestaurantPage merchantId={restaurant.id} basePath={basePath} />;
}
