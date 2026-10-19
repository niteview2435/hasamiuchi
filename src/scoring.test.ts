import { describe, expect, it } from "vitest";
import { computeTeamScore, DEFAULT_SCORING } from "./scoring";

describe("computeTeamScore", () => {
  // 仕様 1.10 の計算例(走者数6、正解 a = 200,000、c = 20)
  it("A: 挟んで r≈1.105 → 27.1点", () => {
    const r = computeTeamScore(
      [100_000, 150_000, 180_000, 190_000, 210_000, 400_000],
      200_000,
    );
    expect(r.placement.kind).toBe("band");
    expect(r.ratio).toBeCloseTo(1.105, 3);
    expect(r.score).toBe(27.1);
    expect(r.mvpPair).toEqual([3, 4]);
  });

  it("B: 広い段 r=2.5 → 3.6点", () => {
    const r = computeTeamScore(
      [50_000, 80_000, 120_000, 300_000, 310_000, 320_000],
      200_000,
    );
    expect(r.ratio).toBe(2.5);
    expect(r.score).toBe(3.6);
  });

  it("C: a < x_1 ははしごの外で0点", () => {
    const r = computeTeamScore([210_000, 250_000, 300_000], 200_000);
    expect(r.placement.kind).toBe("below");
    expect(r.score).toBe(0);
    expect(r.ratio).toBeNull();
  });

  // 仕様 1.5 の目安テーブル(c = 20)
  it.each([
    [1, 30],
    [1.1, 27.2],
    [1.5, 18.3],
    [2, 10],
  ])("比 r=%s → %s点", (ratio, expected) => {
    // lower=1000, upper=1000*ratio の2段はしご。a は中間。
    const upper = Math.round(1000 * ratio);
    const r = computeTeamScore([1000, upper], Math.floor((1000 + upper) / 2));
    expect(r.score).toBe(expected);
  });

  it("約2.8倍以上は0点に張り付く", () => {
    const r = computeTeamScore([1000, 3000], 2000);
    expect(r.score).toBe(0);
  });

  it("一致ははしごの内側・満点・ピタリ賞", () => {
    const r = computeTeamScore([100, 200, 300], 200);
    expect(r.placement).toEqual({ kind: "exact", index: 1 });
    expect(r.score).toBe(30);
    expect(r.pitari).toBe(true);
    expect(r.pitariValue).toBe(200);
    expect(r.ratio).toBe(1);
  });

  it("ピタリは正解を単位に丸めた値への一致で成立(真の正解が半端でも可)", () => {
    const cfg = { c: 20, pitariBonus: 20, unit: 1000 };
    const r = computeTeamScore([230000, 235000, 240000], 234700, cfg);
    expect(r.pitari).toBe(true);
    expect(r.pitariValue).toBe(235000); // 234700 → 235000 に丸め
    // 段の判定は真の正解 234700 で行う(230000 < 234700 < 235000)
    expect(r.placement.kind).toBe("band");
  });

  it("丸めた値がはしごに無ければピタリにならない", () => {
    const cfg = { c: 20, pitariBonus: 20, unit: 1000 };
    const r = computeTeamScore([230000, 236000, 240000], 234700, cfg);
    expect(r.pitari).toBe(false);
    expect(r.pitariValue).toBeNull();
  });

  it("a > x_m ははしごの外・上で0点", () => {
    const r = computeTeamScore([100, 200, 300], 500);
    expect(r.placement.kind).toBe("above");
    expect(r.score).toBe(0);
    expect(r.declaredBand).toBe(3);
  });

  it("段の宣言番号は 1-based の段を返す", () => {
    const r = computeTeamScore([100, 200, 300, 400], 250);
    expect(r.declaredBand).toBe(2);
  });

  it("c を上げると安全策(毎回1.5倍)の得点が下がる", () => {
    const ladder = [1000, 1500];
    const a = 1200;
    const c10 = computeTeamScore(ladder, a, { ...DEFAULT_SCORING, c: 10 });
    const c20 = computeTeamScore(ladder, a, { ...DEFAULT_SCORING, c: 20 });
    expect(c10.score).toBeGreaterThan(c20.score);
  });
});
