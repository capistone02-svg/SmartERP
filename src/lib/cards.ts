import type { Option } from "@/components/shared/SearchSelect"

// Membership / loyalty cards stored on a customer.
// Any card other than "none" makes the customer a priority in Customer Service.
export const CARD_NONE = "none"

export const CARD_OPTIONS: Option[] = [
  { value: "none", label: "No card" },
  { value: "loyalty", label: "Loyalty card" },
  { value: "membership", label: "Membership card" },
]

export const CARD_LABEL: Record<string, string> = {
  loyalty: "Loyalty card",
  membership: "Membership card",
}

export function hasCard(cardType: string | null | undefined): boolean {
  return !!cardType && cardType !== CARD_NONE
}

export function cardLabel(cardType: string | null | undefined): string {
  if (!hasCard(cardType)) return ""
  return CARD_LABEL[String(cardType)] ?? "Card"
}
