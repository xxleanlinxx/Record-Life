import {
  TrainFront,
  BedDouble,
  Utensils,
  Landmark,
  ShoppingBag,
  Ellipsis,
  Plane,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import type { Category, Kind } from "../lib/types";
import { categoryColors } from "../lib/domain";
const icons: Record<Category | Kind, LucideIcon> = {
  Transport: TrainFront,
  Stay: BedDouble,
  Food: Utensils,
  Sights: Landmark,
  Shopping: ShoppingBag,
  Other: Ellipsis,
  flight: Plane,
  transport: TrainFront,
  hotel: BedDouble,
  sight: Landmark,
  food: Utensils,
  shop: ShoppingBag,
};
const cats: Record<Kind, Category> = {
  flight: "Transport",
  transport: "Transport",
  hotel: "Stay",
  sight: "Sights",
  food: "Food",
  shop: "Shopping",
};
export default function CategoryIcon({
  category,
}: {
  category: Category | Kind;
}) {
  const Icon = icons[category] ?? MapPin;
  const color =
    categoryColors[
      category in cats ? cats[category as Kind] : (category as Category)
    ];
  return (
    <span className="category-icon" style={{ color, background: `${color}14` }}>
      <Icon size={20} strokeWidth={1.7} />
    </span>
  );
}
