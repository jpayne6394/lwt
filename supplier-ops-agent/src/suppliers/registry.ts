import type { SupplierConfig } from "./types.ts";

export function createSupplierRegistry(): SupplierConfig[] {
  return [
    {
      id: "emerson-ecologics",
      name: "Emerson Ecologics",
      mode: "website",
      brands: ["NOW", "Pure Encapsulations", "Metagenics", "Designs for Health", "Nordic Naturals", "Thorne Research"],
      credentialEnvVar: "SUPPLIER_CREDENTIAL_EMERSON_ECOLOGICS",
      notes: "Main aggregator supplier. Prefer structured export/API if available; use portal automation fallback.",
    },
    {
      id: "bioresource-pekana",
      name: "BioResource / Pekana",
      mode: "website",
      brands: ["Pekana", "BioResource"],
      credentialEnvVar: "SUPPLIER_CREDENTIAL_BIORESOURCE_PEKANA",
      notes: "Direct supplier for Pekana/BioResource products.",
    },
    {
      id: "systemic-formulas",
      name: "Systemic Formulas",
      mode: "website",
      brands: ["Systemic Formulas"],
      credentialEnvVar: "SUPPLIER_CREDENTIAL_SYSTEMIC_FORMULAS",
      notes: "Direct supplier portal.",
    },
    {
      id: "research-nutritionals",
      name: "Research Nutritionals",
      mode: "website",
      brands: ["Research Nutritionals"],
      credentialEnvVar: "SUPPLIER_CREDENTIAL_RESEARCH_NUTRITIONALS",
      notes: "Direct supplier portal.",
    },
    {
      id: "world-health-mall",
      name: "World Health Mall",
      mode: "website",
      brands: ["World Health Mall"],
      credentialEnvVar: "SUPPLIER_CREDENTIAL_WORLD_HEALTH_MALL",
      notes: "Direct supplier portal.",
    },
    {
      id: "desbio",
      name: "DesBio",
      mode: "website",
      brands: ["DesBio"],
      credentialEnvVar: "SUPPLIER_CREDENTIAL_DESBIO",
      notes: "Direct supplier portal for DesBio products.",
    },
    {
      id: "physicians-standard",
      name: "Physicians' Standard",
      mode: "website",
      brands: ["Physicians' Standard"],
      credentialEnvVar: "SUPPLIER_CREDENTIAL_PHYSICIANS_STANDARD",
      notes: "Direct supplier portal for Physicians' Standard products.",
    },
  ];
}

