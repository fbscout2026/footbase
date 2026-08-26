import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCbfAthleteDetail, parseCbfTeamRoster } from "./services/scraper/parse-cbf-athlete-detail.ts";

const athleteHtml = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/cbf-atleta-735350.html", import.meta.url)),
  "utf8",
);
const teamHtml = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/cbf-time-59897.html", import.meta.url)),
  "utf8",
);

test("parseCbfAthleteDetail extracts id, name, apelido, birth date (ISO) and current club from a real fixture", () => {
  const detail = parseCbfAthleteDetail(athleteHtml);
  assert.ok(detail);
  assert.equal(detail.atletaId, 735350);
  assert.equal(detail.name, "Sávio Victor Braga Soares");
  assert.equal(detail.apelido, "Sávio");
  assert.equal(detail.birthDateIso, "2007-07-23");
  assert.equal(detail.cbfClubId, 59897);
});

test("parseCbfAthleteDetail returns null for a page with no athlete payload", () => {
  assert.equal(parseCbfAthleteDetail("<html><body>not an athlete page</body></html>"), null);
});

test("parseCbfTeamRoster extracts every distinct real atleta_id from a real team fixture", () => {
  const ids = parseCbfTeamRoster(teamHtml);
  assert.ok(ids.length > 5, `expected a real roster, got ${ids.length} ids`);
  assert.ok(ids.includes(735350), "the same athlete confirmed via the detail-page fixture should be on this roster");
  assert.equal(new Set(ids).size, ids.length, "no duplicate ids");
});

test("parseCbfTeamRoster returns an empty list for a page with no roster", () => {
  assert.deepEqual(parseCbfTeamRoster("<html><body>no roster here</body></html>"), []);
});
