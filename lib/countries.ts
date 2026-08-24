import { getCountryCallingCode, type CountryCode } from "libphonenumber-js";

export interface Country {
  code: CountryCode;
  name: string;
  continent: string;
  dialCode: string;
}

// FOOTBASE Session 57 — signup country picker (WS6). Curated list of real countries
// (not the full ~245-entry ISO territory list, most of which are small dependencies
// irrelevant to a football-scouting product) grouped by continent, with the dial
// code derived from `libphonenumber-js` rather than hand-maintained — one source of
// truth, never drifts out of sync with the phone-formatting logic that uses the
// same library.
const RAW: { code: CountryCode; name: string; continent: string }[] = [
  // América do Sul
  { code: "BR", name: "Brasil", continent: "América do Sul" },
  { code: "AR", name: "Argentina", continent: "América do Sul" },
  { code: "CL", name: "Chile", continent: "América do Sul" },
  { code: "CO", name: "Colômbia", continent: "América do Sul" },
  { code: "EC", name: "Equador", continent: "América do Sul" },
  { code: "PY", name: "Paraguai", continent: "América do Sul" },
  { code: "PE", name: "Peru", continent: "América do Sul" },
  { code: "UY", name: "Uruguai", continent: "América do Sul" },
  { code: "VE", name: "Venezuela", continent: "América do Sul" },
  { code: "BO", name: "Bolívia", continent: "América do Sul" },
  { code: "GY", name: "Guiana", continent: "América do Sul" },
  { code: "SR", name: "Suriname", continent: "América do Sul" },

  // América do Norte e Central
  { code: "US", name: "Estados Unidos", continent: "América do Norte e Central" },
  { code: "CA", name: "Canadá", continent: "América do Norte e Central" },
  { code: "MX", name: "México", continent: "América do Norte e Central" },
  { code: "CR", name: "Costa Rica", continent: "América do Norte e Central" },
  { code: "PA", name: "Panamá", continent: "América do Norte e Central" },
  { code: "GT", name: "Guatemala", continent: "América do Norte e Central" },
  { code: "HN", name: "Honduras", continent: "América do Norte e Central" },
  { code: "SV", name: "El Salvador", continent: "América do Norte e Central" },
  { code: "NI", name: "Nicarágua", continent: "América do Norte e Central" },
  { code: "CU", name: "Cuba", continent: "América do Norte e Central" },
  { code: "DO", name: "República Dominicana", continent: "América do Norte e Central" },
  { code: "JM", name: "Jamaica", continent: "América do Norte e Central" },

  // Europa
  { code: "PT", name: "Portugal", continent: "Europa" },
  { code: "ES", name: "Espanha", continent: "Europa" },
  { code: "FR", name: "França", continent: "Europa" },
  { code: "IT", name: "Itália", continent: "Europa" },
  { code: "GB", name: "Reino Unido", continent: "Europa" },
  { code: "DE", name: "Alemanha", continent: "Europa" },
  { code: "NL", name: "Países Baixos", continent: "Europa" },
  { code: "BE", name: "Bélgica", continent: "Europa" },
  { code: "CH", name: "Suíça", continent: "Europa" },
  { code: "AT", name: "Áustria", continent: "Europa" },
  { code: "IE", name: "Irlanda", continent: "Europa" },
  { code: "SE", name: "Suécia", continent: "Europa" },
  { code: "NO", name: "Noruega", continent: "Europa" },
  { code: "DK", name: "Dinamarca", continent: "Europa" },
  { code: "FI", name: "Finlândia", continent: "Europa" },
  { code: "PL", name: "Polônia", continent: "Europa" },
  { code: "GR", name: "Grécia", continent: "Europa" },
  { code: "TR", name: "Turquia", continent: "Europa" },
  { code: "RU", name: "Rússia", continent: "Europa" },
  { code: "UA", name: "Ucrânia", continent: "Europa" },
  { code: "RO", name: "Romênia", continent: "Europa" },
  { code: "CZ", name: "República Tcheca", continent: "Europa" },
  { code: "HU", name: "Hungria", continent: "Europa" },
  { code: "CY", name: "Chipre", continent: "Europa" },
  { code: "RS", name: "Sérvia", continent: "Europa" },
  { code: "HR", name: "Croácia", continent: "Europa" },
  { code: "SK", name: "Eslováquia", continent: "Europa" },
  { code: "BG", name: "Bulgária", continent: "Europa" },
  { code: "SI", name: "Eslovênia", continent: "Europa" },
  { code: "AL", name: "Albânia", continent: "Europa" },
  { code: "IS", name: "Islândia", continent: "Europa" },
  { code: "LU", name: "Luxemburgo", continent: "Europa" },

  // África
  { code: "ZA", name: "África do Sul", continent: "África" },
  { code: "NG", name: "Nigéria", continent: "África" },
  { code: "EG", name: "Egito", continent: "África" },
  { code: "MA", name: "Marrocos", continent: "África" },
  { code: "DZ", name: "Argélia", continent: "África" },
  { code: "TN", name: "Tunísia", continent: "África" },
  { code: "GH", name: "Gana", continent: "África" },
  { code: "SN", name: "Senegal", continent: "África" },
  { code: "CI", name: "Costa do Marfim", continent: "África" },
  { code: "CM", name: "Camarões", continent: "África" },
  { code: "KE", name: "Quênia", continent: "África" },
  { code: "AO", name: "Angola", continent: "África" },
  { code: "MZ", name: "Moçambique", continent: "África" },
  { code: "CV", name: "Cabo Verde", continent: "África" },
  { code: "GN", name: "Guiné", continent: "África" },
  { code: "ML", name: "Mali", continent: "África" },

  // Ásia
  { code: "JP", name: "Japão", continent: "Ásia" },
  { code: "CN", name: "China", continent: "Ásia" },
  { code: "KR", name: "Coreia do Sul", continent: "Ásia" },
  { code: "IN", name: "Índia", continent: "Ásia" },
  { code: "SA", name: "Arábia Saudita", continent: "Ásia" },
  { code: "AE", name: "Emirados Árabes Unidos", continent: "Ásia" },
  { code: "QA", name: "Catar", continent: "Ásia" },
  { code: "IL", name: "Israel", continent: "Ásia" },
  { code: "ID", name: "Indonésia", continent: "Ásia" },
  { code: "TH", name: "Tailândia", continent: "Ásia" },
  { code: "VN", name: "Vietnã", continent: "Ásia" },
  { code: "MY", name: "Malásia", continent: "Ásia" },
  { code: "PH", name: "Filipinas", continent: "Ásia" },
  { code: "SG", name: "Singapura", continent: "Ásia" },
  { code: "IR", name: "Irã", continent: "Ásia" },
  { code: "IQ", name: "Iraque", continent: "Ásia" },
  { code: "JO", name: "Jordânia", continent: "Ásia" },
  { code: "LB", name: "Líbano", continent: "Ásia" },
  { code: "KW", name: "Kuwait", continent: "Ásia" },
  { code: "OM", name: "Omã", continent: "Ásia" },

  // Oceania
  { code: "AU", name: "Austrália", continent: "Oceania" },
  { code: "NZ", name: "Nova Zelândia", continent: "Oceania" },
  { code: "FJ", name: "Fiji", continent: "Oceania" },
];

export const COUNTRIES: Country[] = RAW.map((c) => ({
  ...c,
  dialCode: `+${getCountryCallingCode(c.code)}`,
})).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

export const COUNTRIES_BY_CONTINENT: Record<string, Country[]> = COUNTRIES.reduce(
  (acc, country) => {
    (acc[country.continent] ??= []).push(country);
    return acc;
  },
  {} as Record<string, Country[]>
);

export const CONTINENT_ORDER = [
  "América do Sul",
  "América do Norte e Central",
  "Europa",
  "África",
  "Ásia",
  "Oceania",
];

export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
