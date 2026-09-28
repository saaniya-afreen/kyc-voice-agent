// Pure classification helpers shared by retell-kyc-processor.
// See docs/architecture.md for how these map onto the platform's ten call-flow outcomes.

export type RiskTier = "low" | "medium" | "high";

// Higher risk = shorter interval before the next mandatory refresh.
export function reviewYearsForRiskTier(tier: RiskTier): number {
  return tier === "high" ? 1 : tier === "medium" ? 3 : 5;
}

export interface ScreeningPayload {
  is_resident_uae: boolean;
  tax_residencies: string[];
  has_us_indicia: boolean;
  account_structure: "single" | "joint" | "poa" | "trust";
  declaration_confirmed: boolean;
}

export interface Uc2Result {
  outcome_code: "UC-2.1" | "UC-2.2" | "UC-2.3" | null;
  escalation_reason: string;
  material_change_type: string | null;
  required_documents: string[];
}

export function isForeignTaxResident(taxResidencies: string[]): boolean {
  return taxResidencies.some((c) => c.toUpperCase() !== "AE");
}

export function isComplexStructure(structure: string): boolean {
  return structure === "poa" || structure === "trust";
}

export function isStraightThrough(payload: ScreeningPayload): boolean {
  return (
    payload.is_resident_uae &&
    !isForeignTaxResident(payload.tax_residencies) &&
    !payload.has_us_indicia &&
    !isComplexStructure(payload.account_structure)
  );
}

// Priority for which UC-2.x label describes the case when several triggers fire at once:
// FATCA (US) > TIN exception > multi-jurisdiction CRS. Account-structure changes that fire
// on their own (UAE-only, no US ties, no foreign residency) don't map to one of the ten
// named flows, so outcome_code comes back null and the reason is carried in escalation_reason.
export function classifyUc2(
  payload: ScreeningPayload,
  hasTinException: boolean
): Uc2Result {
  const reasons: string[] = [];
  const requiredDocuments: string[] = [];
  const foreign = isForeignTaxResident(payload.tax_residencies);
  const complexStructure = isComplexStructure(payload.account_structure);

  if (payload.has_us_indicia) {
    reasons.push("US indicia detected (FATCA)");
    requiredDocuments.push("W-9 or W-8BEN Form");
  }
  if (foreign) {
    reasons.push(`Foreign tax residency: ${payload.tax_residencies.filter((c) => c.toUpperCase() !== "AE").join(", ")}`);
    requiredDocuments.push("CRS Self-Certification Form");
  }
  if (hasTinException) {
    reasons.push("TIN exception on file (OECD reason code)");
  }
  if (complexStructure) {
    reasons.push(`Account structure change: ${payload.account_structure}`);
  }

  const outcome_code = payload.has_us_indicia
    ? "UC-2.2"
    : hasTinException
    ? "UC-2.3"
    : foreign
    ? "UC-2.1"
    : null;

  return {
    outcome_code,
    escalation_reason: reasons.join(" | "),
    material_change_type: complexStructure ? payload.account_structure : null,
    required_documents: requiredDocuments,
  };
}
