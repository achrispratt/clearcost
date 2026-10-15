import { describe, expect, it } from "vitest";
import { detectEmergency } from "@/lib/emergency";

describe("detectEmergency", () => {
  it("flags medical emergencies", () => {
    expect(detectEmergency("I have chest pain")).toBe("medical");
    expect(detectEmergency("knee", "can't breathe well")).toBe("medical");
  });

  it("flags crisis language", () => {
    expect(detectEmergency("thinking about suicide")).toBe("crisis");
  });

  it("leaves routine searches alone", () => {
    expect(detectEmergency("knee MRI")).toBeNull();
    expect(detectEmergency("colonoscopy", "chest x-ray")).toBeNull();
    expect(detectEmergency(undefined, "")).toBeNull();
  });
});
