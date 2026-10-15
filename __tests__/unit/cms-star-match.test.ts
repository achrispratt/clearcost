import { describe, expect, it } from "vitest";
import {
  conflictingNames,
  matchProviders,
  nameSimilarity,
} from "@/scripts/import-cms-star-ratings";

const cms = (
  id: string,
  name: string,
  address: string,
  rating = "4",
  zip = "85712"
) => ({
  "Facility ID": id,
  "Facility Name": name,
  Address: address,
  State: "AZ",
  "ZIP Code": zip,
  "Hospital overall rating": rating,
});
const provider = (
  id: string,
  name: string,
  address: string,
  zip = "85712"
) => ({
  id,
  name,
  address,
  state: "AZ",
  zip,
});

describe("CMS star rating matching", () => {
  it("scores names on distinctive words only", () => {
    expect(
      nameSimilarity("Tucson Medical Center", "TUCSON MEDICAL CENTER")
    ).toBe(1);
    expect(nameSimilarity("Banner Hospital", "Tucson Medical Center")).toBe(0);
  });

  it("flags different brands and facility types", () => {
    expect(
      conflictingNames(
        "University Hospitals Beachwood Medical Center",
        "LAKE HEALTH BEACHWOOD MEDICAL CENTER"
      )
    ).toBe(true);
    expect(
      conflictingNames(
        "Select Specialty Hospital - Tucson",
        "TUCSON MEDICAL CENTER"
      )
    ).toBe(true);
    expect(
      conflictingNames("Tucson Medical Center", "TUCSON MEDICAL CENTER")
    ).toBe(false);
  });

  it("matches on ZIP, address and name, and skips co-located facilities", () => {
    const hospitals = [
      cms("030006", "TUCSON MEDICAL CENTER", "5301 EAST GRANT ROAD"),
    ];
    const matches = matchProviders(
      [
        provider("a", "Tucson Medical Center", "5301 E Grant Road, Tucson, AZ"),
        provider(
          "b",
          "Select Specialty Hospital - Tucson East",
          "5301 East Grant Road, 1st Floor, Tucson, AZ"
        ),
        provider("c", "Tucson Medical Center", "5301 E Grant Rd", "85001"),
      ],
      hospitals
    );
    expect(matches.map((m) => m.provider.id)).toEqual(["a"]);
  });

  it("drops a CCN that two campuses claim equally", () => {
    const hospitals = [
      cms(
        "100044",
        "CLEVELAND CLINIC MARTIN NORTH HOSPITAL",
        "200 SE HOSPITAL AVE"
      ),
    ];
    const matches = matchProviders(
      [
        provider("n", "martin north hospital", "200 SE Hospital Avenue"),
        provider("s", "martin south hospital", "200 SE Hospital Avenue"),
      ],
      hospitals
    );
    // North/South differ only by direction words, so neither is certain.
    expect(matches).toEqual([]);
  });
});
