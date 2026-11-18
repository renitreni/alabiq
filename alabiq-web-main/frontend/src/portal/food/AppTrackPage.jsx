// ---------------------------------------------------------------------
// One restaurant — one app: /app/:hash/track/:code
// Thin wrapper: live order tracking with back/home scoped to this
// restaurant's subtree.
// ---------------------------------------------------------------------
import { useRestaurantApp } from './AppShell';
import FoodTrackPage from './FoodTrackPage';

export default function AppTrackPage() {
  const { basePath } = useRestaurantApp();
  return <FoodTrackPage basePath={basePath} />;
}
