// FOOTBASE — lista curada manualmente (Session 52) de clubes profissionais bem
// conhecidos, chaveados pelo `source_key` real da CBF (`cbf:{id}`), com o título
// exato do artigo na Wikipédia em português cujo escudo é confiável o bastante pra
// usar automaticamente. NUNCA adicionar um clube aqui sem ter certeza do título —
// um título errado/ambíguo arrisca puxar a imagem de outro clube. Times pequenos/
// amadores de base intencionalmente NÃO entram aqui (não têm artigo confiável na
// Wikipédia) — seguem no fallback do escudo oficial da CBF (`cbf-crest.ts`).
export const CURATED_WIKIPEDIA_CREST_BY_CBF_SOURCE_KEY: Record<string, string> = {
  "cbf:20016": "Clube de Regatas do Flamengo",
  "cbf:20014": "Fluminense Football Club",
  "cbf:20002": "Sociedade Esportiva Palmeiras",
  "cbf:20001": "Sport Club Corinthians Paulista",
  "cbf:20005": "São Paulo Futebol Clube",
  "cbf:20008": "Santos Futebol Clube",
  "cbf:20013": "Grêmio Foot-Ball Porto Alegrense",
  "cbf:20011": "Sport Club Internacional",
  "cbf:20018": "Esporte Clube Vitória",
  "cbf:61377": "Esporte Clube Bahia",
  "cbf:20010": "Sport Club do Recife",
  "cbf:20023": "Clube Náutico Capibaribe",
  "cbf:20017": "Paysandu Sport Club",
  "cbf:20052": "Club Athletico Paranaense",
  "cbf:61590": "Coritiba Foot Ball Club",
  "cbf:20019": "Criciúma Esporte Clube",
  "cbf:20058": "Avaí Futebol Clube",
  "cbf:59849": "Cruzeiro Esporte Clube",
  "cbf:62194": "Clube Atlético Mineiro",
  "cbf:59897": "América Futebol Clube (Belo Horizonte)",
  "cbf:20031": "Ceará Sporting Club",
  "cbf:63238": "Fortaleza Esporte Clube",
  "cbf:20032": "Clube de Regatas Brasil",
  "cbf:20045": "Centro Sportivo Alagoano",
  "cbf:20800": "Cuiabá Esporte Clube",
  "cbf:20027": "Esporte Clube Juventude",
  "cbf:20007": "Red Bull Bragantino",
  "cbf:60646": "Club de Regatas Vasco da Gama",
  "cbf:60175": "Botafogo de Futebol e Regatas",
};
