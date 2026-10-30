import { describe, it, expect } from "vitest";
import { parseJsonResponse } from "@/lib/cpt/translate";

describe("parseJsonResponse", () => {
  it("parses bare JSON", () => {
    expect(parseJsonResponse('{"type":"question"}')).toEqual({
      type: "question",
    });
  });

  it("strips a json code fence", () => {
    expect(parseJsonResponse('```json\n{"type":"question"}\n```')).toEqual({
      type: "question",
    });
  });

  it("parses the object when Claude puts prose before it", () => {
    const text =
      'Laterality matters for a knee MRI, so ask which side.\n\n{"type":"question","options":[{"label":"Left"}]}';
    expect(parseJsonResponse(text)).toEqual({
      type: "question",
      options: [{ label: "Left" }],
    });
  });

  it("parses a fenced object with prose around it", () => {
    const text = 'Here you go:\n```json\n{"codes":["73721"]}\n```\nDone.';
    expect(parseJsonResponse(text)).toEqual({ codes: ["73721"] });
  });

  it("still throws when there is no JSON object", () => {
    expect(() => parseJsonResponse("Laterality is unclear.")).toThrow(
      SyntaxError
    );
  });
});
