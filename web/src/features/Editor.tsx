import type { Bundle, Editor as EditorType } from "../lib/types";
import type { EditorActions } from "./forms/shared";
import ExpenseForm from "./forms/ExpenseForm";
import ActivityForm from "./forms/ActivityForm";
import BookingForm from "./forms/BookingForm";
import ShoppingForm from "./forms/ShoppingForm";
import TripForm from "./forms/TripForm";
import CurrencyForm from "./forms/CurrencyForm";
export default function Editor({
  editor,
  data,
  ...actions
}: EditorActions & { editor: EditorType; data?: Bundle }) {
  if (editor.kind === "trip")
    return <TripForm editor={editor} data={data} {...actions} />;
  if (!data) return null;
  switch (editor.kind) {
    case "expense":
      return <ExpenseForm editor={editor} data={data} {...actions} />;
    case "activity":
      return <ActivityForm editor={editor} data={data} {...actions} />;
    case "booking":
      return <BookingForm editor={editor} data={data} {...actions} />;
    case "shopping":
      return <ShoppingForm editor={editor} data={data} {...actions} />;
    case "currency":
      return <CurrencyForm editor={editor} data={data} {...actions} />;
  }
}
