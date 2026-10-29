// "Buy through Tanzania Car Dealers": a logged-in member asks our team to manage buying a car for them
// (check the car and papers, inspection, negotiate, safe payment, ownership transfer).
import { collection } from "./store.js";

export const deals = collection("deals");

export const DEAL_STATUSES = ["new", "contacted", "inspection", "agreed", "completed", "cancelled"];
export const DEAL_LABELS = {
  new: "Request received", contacted: "We are talking to the seller", inspection: "Inspection booked",
  agreed: "Price agreed", completed: "Completed", cancelled: "Cancelled",
};

// What the buyer sees: no internal staff notes or the seller's private number.
export function buyerView(d) {
  const { notes, sellerPhone, ...rest } = d;
  return { ...rest, statusLabel: DEAL_LABELS[d.status] || d.status };
}
