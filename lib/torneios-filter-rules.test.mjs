import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paisesForConfederacao, federacoesForPais, categoriasForFederacao, filterTorneios,
} from "./torneios-filter-rules.ts";

const confederacoes = [{ id: "conmebol", continente: "América do Sul", codigo: "CONMEBOL", nome: "CONMEBOL" }];
const paises = [{ id: "brasil", confederacaoId: "conmebol", nome: "Brasil", codigo: "BR" }];
const federacoes = [
  { id: "cbf", paisId: "brasil", nome: "CBF", sigla: "CBF", tipo: "nacional" },
  { id: "fpf", paisId: "brasil", nome: "FPF", sigla: "FPF", tipo: "estadual" },
];
const torneios = [
  { id: "t1", name: "Brasileirão SUB-20", federationText: "CBF", federacaoId: "cbf", federacaoSigla: "CBF", federacaoNome: "Confederação Brasileira de Futebol", category: "SUB-20", year: 2026 },
  { id: "t2", name: "Copa Paulista SUB-17", federationText: "FPF", federacaoId: "fpf", federacaoSigla: "FPF", federacaoNome: "Federação Paulista de Futebol", category: "SUB-17", year: 2026 },
];

test("paisesForConfederacao narrows by the chosen confederation", () => {
  assert.equal(paisesForConfederacao(paises, "conmebol").length, 1);
  assert.deepEqual(paisesForConfederacao(paises, ""), []);
  assert.deepEqual(paisesForConfederacao(paises, "afc"), []);
});

test("federacoesForPais narrows by the chosen country", () => {
  assert.equal(federacoesForPais(federacoes, "brasil").length, 2);
  assert.deepEqual(federacoesForPais(federacoes, ""), []);
});

test("national federation always offers the full SUB-11..SUB-20 range", () => {
  const cats = categoriasForFederacao(torneios, federacoes[0]);
  assert.equal(cats.length, 10);
  assert.equal(cats[0], "SUB-11");
  assert.equal(cats[9], "SUB-20");
});

test("state federation only offers categories that actually have a torneio", () => {
  const cats = categoriasForFederacao(torneios, federacoes[1]);
  assert.deepEqual(cats, ["SUB-17"]);
});

test("categoriasForFederacao returns [] when no federation is selected", () => {
  assert.deepEqual(categoriasForFederacao(torneios, undefined), []);
});

test("filterTorneios combines quick search with the cascade", () => {
  assert.equal(filterTorneios(torneios, { query: "brasileirão", confederacaoId: "", paisId: "", federacaoId: "", categoria: "" }).length, 1);
  assert.equal(filterTorneios(torneios, { query: "", confederacaoId: "", paisId: "", federacaoId: "fpf", categoria: "" }).length, 1);
  assert.equal(filterTorneios(torneios, { query: "", confederacaoId: "", paisId: "", federacaoId: "cbf", categoria: "SUB-17" }).length, 0);
  assert.equal(filterTorneios(torneios, { query: "", confederacaoId: "", paisId: "", federacaoId: "", categoria: "" }).length, 2);
});

test("filterTorneios also matches by federation acronym and full name (Session 55)", () => {
  assert.equal(filterTorneios(torneios, { query: "fpf", confederacaoId: "", paisId: "", federacaoId: "", categoria: "" }).length, 1);
  assert.equal(filterTorneios(torneios, { query: "paulista de futebol", confederacaoId: "", paisId: "", federacaoId: "", categoria: "" }).length, 1);
  assert.equal(filterTorneios(torneios, { query: "confederação brasileira", confederacaoId: "", paisId: "", federacaoId: "", categoria: "" })[0].id, "t1");
});
